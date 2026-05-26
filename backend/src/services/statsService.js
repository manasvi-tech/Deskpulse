/**
 * Stats Service — all database query logic.
 *
 * Index usage map (verified against 002_indexes.sql):
 *   Live occupancy   → idx_checkins_live_occupancy  (partial WHERE checked_out IS NULL)
 *   Today's revenue  → idx_payments_gym_date         (gym_id, paid_at DESC)
 *   Churn risk       → idx_members_churn_risk         (last_checkin_at WHERE status='active')
 *   Cross-gym rev    → idx_payments_date              (paid_at DESC)
 *   Active anomalies → idx_anomalies_active           (partial WHERE resolved=FALSE)
 *   Heatmap          → gym_hourly_stats materialized view unique index
 *
 * RULE: No sequential scans on checkins or payments — ever.
 */

const pool = require('../db/pool');

// ── Q1: Live occupancy (< 0.5ms) ─────────────────────────────────────────────
/**
 * Count open check-ins for one gym.
 * Uses: idx_checkins_live_occupancy
 */
async function getLiveOccupancy(gymId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS occupancy
     FROM checkins
     WHERE gym_id = $1 AND checked_out IS NULL`,
    [gymId]
  );
  return rows[0].occupancy;
}

// ── Q2: Today's revenue (< 0.8ms) ────────────────────────────────────────────
/**
 * Sum payments for one gym since midnight today.
 * Uses: idx_payments_gym_date
 */
async function getTodayRevenue(gymId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS revenue
     FROM payments
     WHERE gym_id = $1 AND paid_at >= CURRENT_DATE`,
    [gymId]
  );
  return rows[0].revenue;
}

// ── GET /api/gyms — all gyms with stats ──────────────────────────────────────
/**
 * Returns every active gym with live occupancy and today's revenue in one
 * query using LATERAL subqueries — avoids N+1.
 */
async function getAllGymsWithStats() {
  const { rows } = await pool.query(`
    SELECT
      g.id,
      g.name,
      g.city,
      g.address,
      g.capacity,
      g.status,
      g.opens_at::text,
      g.closes_at::text,
      occ.occupancy,
      ROUND((occ.occupancy::numeric / NULLIF(g.capacity, 0) * 100), 1)::float AS occupancy_pct,
      rev.revenue AS today_revenue
    FROM gyms g
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS occupancy
      FROM checkins c
      WHERE c.gym_id = g.id AND c.checked_out IS NULL
    ) occ ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(amount), 0)::float AS revenue
      FROM payments p
      WHERE p.gym_id = g.id AND p.paid_at >= CURRENT_DATE
    ) rev ON true
    ORDER BY g.name
  `);
  return rows;
}

// ── GET /api/gyms/:id/live — single gym snapshot (< 5ms) ─────────────────────
/**
 * Fetches gym metadata, live occupancy, today's revenue, and the most recent
 * 10 activity entries in three parallel queries.
 * Returns null if gym does not exist.
 */
async function getGymLive(gymId) {
  const gymRes = await pool.query(
    `SELECT id, name, city, address, capacity, status, opens_at::text, closes_at::text
     FROM gyms
     WHERE id = $1`,
    [gymId]
  );
  if (gymRes.rows.length === 0) return null;

  const gym = gymRes.rows[0];

  const [occRes, revRes, actRes] = await Promise.all([
    // idx_checkins_live_occupancy
    pool.query(
      `SELECT COUNT(*)::int AS occupancy
       FROM checkins
       WHERE gym_id = $1 AND checked_out IS NULL`,
      [gymId]
    ),
    // idx_payments_gym_date
    pool.query(
      `SELECT COALESCE(SUM(amount), 0)::float AS revenue
       FROM payments
       WHERE gym_id = $1 AND paid_at >= CURRENT_DATE`,
      [gymId]
    ),
    // Recent activity feed — BRIN index narrows time range first
    pool.query(
      `SELECT m.name AS member_name, c.checked_in, c.checked_out,
              c.duration_min, c.gym_id
       FROM checkins c
       JOIN members m ON m.id = c.member_id
       WHERE c.gym_id = $1
         AND c.checked_in >= NOW() - INTERVAL '24 hours'
       ORDER BY c.checked_in DESC
       LIMIT 10`,
      [gymId]
    ),
  ]);

  const occupancy   = occRes.rows[0].occupancy;
  const capacity    = gym.capacity;
  const occupancyPct = capacity > 0
    ? Math.round((occupancy / capacity) * 1000) / 10
    : 0;

  return {
    ...gym,
    occupancy,
    occupancy_pct:  occupancyPct,
    today_revenue:  revRes.rows[0].revenue,
    recent_activity: actRes.rows,
  };
}

// ── GET /api/gyms/:id/analytics ───────────────────────────────────────────────
/**
 * Returns heatmap data, revenue over time, churn risk members, and plan mix.
 * dateRange: '7d' | '30d' | '90d'
 */
async function getGymAnalytics(gymId, dateRange) {
  const days     = dateRange === '90d' ? 90 : dateRange === '30d' ? 30 : 7;
  const interval = `${days} days`;

  // Verify gym exists
  const gymRes = await pool.query(
    `SELECT id, name, capacity FROM gyms WHERE id = $1`,
    [gymId]
  );
  if (gymRes.rows.length === 0) return null;

  const [heatmapRes, revenueRes, churnRes, memberRes] = await Promise.all([
    // Q4 — Heatmap via materialized view (< 0.3ms)
    pool.query(
      `SELECT day_of_week, hour_of_day, checkin_count
       FROM gym_hourly_stats
       WHERE gym_id = $1
       ORDER BY day_of_week, hour_of_day`,
      [gymId]
    ),

    // Revenue trend — idx_payments_gym_date covers the filter
    pool.query(
      `SELECT
         DATE_TRUNC('day', paid_at)::date AS date,
         SUM(amount)::float               AS revenue,
         COUNT(*)::int                    AS payment_count
       FROM payments
       WHERE gym_id = $1
         AND paid_at >= NOW() - ($2 || ' days')::interval
       GROUP BY DATE_TRUNC('day', paid_at)
       ORDER BY date`,
      [gymId, days]
    ),

    // Q3 — Churn risk: idx_members_churn_risk (partial WHERE status='active')
    pool.query(
      `SELECT
         id, name, email, plan_type, last_checkin_at,
         EXTRACT(EPOCH FROM (NOW() - last_checkin_at))::int / 86400 AS days_since_checkin,
         CASE
           WHEN last_checkin_at < NOW() - INTERVAL '60 days' THEN 'CRITICAL'
           ELSE 'HIGH'
         END AS risk_level
       FROM members
       WHERE status = 'active'
         AND gym_id = $1
         AND last_checkin_at < NOW() - INTERVAL '45 days'
       ORDER BY last_checkin_at ASC
       LIMIT 200`,
      [gymId]
    ),

    // Member plan mix
    pool.query(
      `SELECT
         COUNT(*)::int                                        AS total_members,
         COUNT(*) FILTER (WHERE status = 'active')::int      AS active_members,
         COUNT(*) FILTER (WHERE status = 'inactive')::int    AS inactive_members,
         COUNT(*) FILTER (WHERE status = 'frozen')::int      AS frozen_members,
         COUNT(*) FILTER (WHERE plan_type = 'monthly')::int  AS monthly_count,
         COUNT(*) FILTER (WHERE plan_type = 'quarterly')::int AS quarterly_count,
         COUNT(*) FILTER (WHERE plan_type = 'annual')::int   AS annual_count
       FROM members
       WHERE gym_id = $1`,
      [gymId]
    ),
  ]);

  const ms = memberRes.rows[0];
  const total = ms.total_members || 1; // avoid /0

  return {
    gym:          gymRes.rows[0],
    heatmap:      heatmapRes.rows,
    revenue_chart: revenueRes.rows,
    churn_risk:   churnRes.rows,
    member_stats: {
      ...ms,
      monthly_pct:   Math.round((ms.monthly_count   / total) * 100),
      quarterly_pct: Math.round((ms.quarterly_count / total) * 100),
      annual_pct:    Math.round((ms.annual_count    / total) * 100),
    },
  };
}

// ── Q5: Cross-gym revenue comparison (< 2ms) ──────────────────────────────────
/**
 * Revenue totals for all gyms over the last 30 days.
 * Uses: idx_payments_date (paid_at DESC) — date filter, then GROUP BY gym
 */
async function getCrossGymRevenue() {
  const { rows } = await pool.query(`
    SELECT
      g.id       AS gym_id,
      g.name     AS gym_name,
      g.city,
      COALESCE(SUM(p.amount), 0)::float AS total_revenue,
      COUNT(p.id)::int                  AS payment_count
    FROM gyms g
    LEFT JOIN payments p
      ON p.gym_id = g.id
     AND p.paid_at >= NOW() - INTERVAL '30 days'
    GROUP BY g.id, g.name, g.city
    ORDER BY total_revenue DESC
  `);
  return rows;
}

// ── Q6: Active anomalies (< 0.3ms) ───────────────────────────────────────────
/**
 * All unresolved anomalies, optionally filtered by gym_id and/or severity.
 * Uses: idx_anomalies_active (partial WHERE resolved=FALSE)
 */
async function getActiveAnomalies({ gymId, severity } = {}) {
  const params = [];
  let where    = 'WHERE a.resolved = FALSE';

  if (gymId) {
    params.push(gymId);
    where += ` AND a.gym_id = $${params.length}`;
  }
  if (severity) {
    params.push(severity);
    where += ` AND a.severity = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT
       a.id, a.gym_id, g.name AS gym_name,
       a.type, a.severity, a.message,
       a.resolved, a.dismissed,
       a.detected_at, a.resolved_at
     FROM anomalies a
     JOIN gyms g ON g.id = a.gym_id
     ${where}
     ORDER BY a.detected_at DESC`,
    params
  );
  return rows;
}

// ── Anomaly helpers ───────────────────────────────────────────────────────────
async function getAnomalyById(id) {
  const { rows } = await pool.query(
    `SELECT * FROM anomalies WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Dismiss a WARNING anomaly.
 * Returns { error: 'not_found' | 'forbidden' | 'already_resolved' } on failure,
 * or { anomaly } on success.
 */
async function dismissAnomaly(id) {
  const anomaly = await getAnomalyById(id);
  if (!anomaly)                      return { error: 'not_found' };
  if (anomaly.severity === 'critical') return { error: 'forbidden' };
  if (anomaly.resolved)               return { error: 'already_resolved' };

  const { rows } = await pool.query(
    `UPDATE anomalies
     SET dismissed = TRUE
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return { anomaly: rows[0] };
}

module.exports = {
  getLiveOccupancy,
  getTodayRevenue,
  getAllGymsWithStats,
  getGymLive,
  getGymAnalytics,
  getCrossGymRevenue,
  getActiveAnomalies,
  getAnomalyById,
  dismissAnomaly,
};
