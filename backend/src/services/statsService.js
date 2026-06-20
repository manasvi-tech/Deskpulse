/**
 * Stats Service — all database query logic.
 *
 * Index usage map (verified against 006_coworking_indexes.sql):
 *   Live occupancy      → idx_checkins_live_occupancy  (partial WHERE checked_out IS NULL)
 *   Today's revenue     → idx_payments_location_date   (location_id, paid_at DESC)
 *   Churn risk          → idx_memberships_churn_risk   (end_date WHERE status='active')
 *   Cross-location rev  → idx_payments_date            (paid_at DESC)
 *   Active anomalies    → idx_anomalies_active         (partial WHERE resolved=FALSE)
 *   Heatmap             → location_hourly_stats materialized view unique index
 *
 * RULE: No sequential scans on checkins or payments — ever.
 */

const pool = require('../db/pool');

// ── Q1: Live occupancy (< 0.5ms) ─────────────────────────────────────────────
async function getLiveOccupancy(locationId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS occupancy
     FROM checkins
     WHERE location_id = $1 AND checked_out IS NULL`,
    [locationId]
  );
  return rows[0].occupancy;
}

// ── Q2: Today's revenue (< 0.8ms) ────────────────────────────────────────────
async function getTodayRevenue(locationId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS revenue
     FROM payments
     WHERE location_id = $1 AND paid_at >= CURRENT_DATE`,
    [locationId]
  );
  return rows[0].revenue;
}

// ── GET /api/locations — all locations with stats ─────────────────────────────
/**
 * Returns every active location with live occupancy and today's revenue using
 * LATERAL subqueries — avoids N+1.
 * Capacity = total_hot_desks + total_dedicated_desks + total_private_offices.
 */
async function getAllLocationsWithStats() {
  const { rows } = await pool.query(`
    SELECT
      l.id,
      l.name,
      l.city,
      l.address,
      l.total_hot_desks,
      l.total_dedicated_desks,
      l.total_private_offices,
      l.total_meeting_rooms,
      (l.total_hot_desks + l.total_dedicated_desks + l.total_private_offices) AS capacity,
      l.status,
      l.opens_at::text,
      l.closes_at::text,
      occ.occupancy,
      ROUND(
        occ.occupancy::numeric
        / NULLIF(l.total_hot_desks + l.total_dedicated_desks + l.total_private_offices, 0)
        * 100,
        1
      )::float AS occupancy_pct,
      rev.revenue AS today_revenue
    FROM locations l
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS occupancy
      FROM checkins c
      WHERE c.location_id = l.id AND c.checked_out IS NULL
    ) occ ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(amount), 0)::float AS revenue
      FROM payments p
      WHERE p.location_id = l.id AND p.paid_at >= CURRENT_DATE
    ) rev ON true
    ORDER BY l.name
  `);
  return rows;
}

// ── GET /api/locations/:id/live — single location snapshot (< 5ms) ───────────
/**
 * Returns location metadata, live occupancy, today's revenue, and the most
 * recent 10 activity entries in three parallel queries.
 * Returns null if location does not exist.
 */
async function getLocationLive(locationId) {
  const locRes = await pool.query(
    `SELECT
       id, name, city, address, status,
       total_hot_desks, total_dedicated_desks, total_private_offices, total_meeting_rooms,
       (total_hot_desks + total_dedicated_desks + total_private_offices) AS capacity,
       opens_at::text, closes_at::text
     FROM locations
     WHERE id = $1`,
    [locationId]
  );
  if (locRes.rows.length === 0) return null;

  const location = locRes.rows[0];

  const [occRes, revRes, actRes] = await Promise.all([
    // idx_checkins_live_occupancy
    pool.query(
      `SELECT COUNT(*)::int AS occupancy
       FROM checkins
       WHERE location_id = $1 AND checked_out IS NULL`,
      [locationId]
    ),
    // idx_payments_location_date
    pool.query(
      `SELECT COALESCE(SUM(amount), 0)::float AS revenue
       FROM payments
       WHERE location_id = $1 AND paid_at >= CURRENT_DATE`,
      [locationId]
    ),
    // Recent activity — BRIN index narrows time range first
    pool.query(
      `SELECT m.name AS member_name, c.checked_in, c.checked_out,
              c.duration_min, c.location_id
       FROM checkins c
       JOIN members m ON m.id = c.member_id
       WHERE c.location_id = $1
         AND c.checked_in >= NOW() - INTERVAL '24 hours'
       ORDER BY c.checked_in DESC
       LIMIT 10`,
      [locationId]
    ),
  ]);

  const occupancy    = occRes.rows[0].occupancy;
  const capacity     = location.capacity;
  const occupancyPct = capacity > 0
    ? Math.round((occupancy / capacity) * 1000) / 10
    : 0;

  return {
    ...location,
    occupancy,
    occupancy_pct:   occupancyPct,
    today_revenue:   revRes.rows[0].revenue,
    recent_activity: actRes.rows,
  };
}

// ── GET /api/locations/:id/analytics ─────────────────────────────────────────
/**
 * Returns heatmap, revenue trend, churn risk (two tiers), and member stats.
 * dateRange: '7d' | '30d' | '90d'
 */
async function getLocationAnalytics(locationId, dateRange) {
  const days     = dateRange === '90d' ? 90 : dateRange === '30d' ? 30 : 7;
  const interval = `${days} days`;

  const locRes = await pool.query(
    `SELECT id, name,
       total_hot_desks, total_dedicated_desks, total_private_offices, total_meeting_rooms,
       (total_hot_desks + total_dedicated_desks + total_private_offices) AS capacity
     FROM locations WHERE id = $1`,
    [locationId]
  );
  if (locRes.rows.length === 0) return null;

  const [heatmapRes, revenueRes, expiringSoonRes, inactiveRes, memberRes] = await Promise.all([
    // Q4 — Heatmap via materialized view (< 0.3ms)
    pool.query(
      `SELECT day_of_week, hour_of_day, checkin_count
       FROM location_hourly_stats
       WHERE location_id = $1
       ORDER BY day_of_week, hour_of_day`,
      [locationId]
    ),

    // Revenue trend by plan type — join to memberships for plan_type
    // idx_payments_location_date covers the filter
    pool.query(
      `SELECT
         DATE_TRUNC('day', p.paid_at)::date AS date,
         ms.plan_type,
         SUM(p.amount)::float               AS revenue,
         COUNT(*)::int                      AS payment_count
       FROM payments p
       JOIN memberships ms ON ms.id = p.membership_id
       WHERE p.location_id = $1
         AND p.paid_at >= NOW() - ($2 || ' days')::interval
       GROUP BY DATE_TRUNC('day', p.paid_at), ms.plan_type
       ORDER BY date, ms.plan_type`,
      [locationId, days]
    ),

    // Q3 — Churn tier 1: Expiring Soon (active membership, end_date ≤ now + 7 days)
    // idx_memberships_churn_risk covers end_date WHERE status='active'
    pool.query(
      `SELECT
         m.id, m.name, m.email,
         ms.plan_type, ms.end_date,
         EXTRACT(EPOCH FROM (ms.end_date - NOW()))::int / 86400 AS days_until_expiry
       FROM members m
       JOIN memberships ms ON ms.member_id = m.id
       WHERE ms.status = 'active'
         AND ms.location_id = $1
         AND ms.end_date <= NOW() + INTERVAL '7 days'
         AND ms.end_date > NOW()
         AND NOT EXISTS (
           SELECT 1 FROM memberships ms2
           WHERE ms2.member_id = m.id
             AND ms2.status = 'active'
             AND ms2.start_date > ms.start_date
         )
       ORDER BY ms.end_date ASC
       LIMIT 200`,
      [locationId]
    ),

    // Churn tier 2: Inactive (active membership, no check-in in 30+ days)
    pool.query(
      `SELECT
         m.id, m.name, m.email,
         ms.plan_type,
         MAX(c.checked_in) AS last_checkin_at,
         EXTRACT(EPOCH FROM (NOW() - MAX(c.checked_in)))::int / 86400 AS days_since_checkin
       FROM members m
       JOIN memberships ms ON ms.member_id = m.id AND ms.status = 'active'
       LEFT JOIN checkins c ON c.member_id = m.id
       WHERE ms.location_id = $1
       GROUP BY m.id, m.name, m.email, ms.plan_type
       HAVING MAX(c.checked_in) < NOW() - INTERVAL '30 days'
          OR  MAX(c.checked_in) IS NULL
       ORDER BY last_checkin_at ASC NULLS FIRST
       LIMIT 200`,
      [locationId]
    ),

    // Member plan mix — active memberships for this location
    pool.query(
      `SELECT
         COUNT(DISTINCT m.id)::int                                                        AS total_members,
         COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'active')::int                    AS active_members,
         COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'inactive')::int                  AS inactive_members,
         COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'frozen')::int                    AS frozen_members,
         COUNT(ms.id) FILTER (WHERE ms.plan_type = 'day_pass'        AND ms.status = 'active')::int AS day_pass_count,
         COUNT(ms.id) FILTER (WHERE ms.plan_type = 'hot_desk'        AND ms.status = 'active')::int AS hot_desk_count,
         COUNT(ms.id) FILTER (WHERE ms.plan_type = 'dedicated_desk'  AND ms.status = 'active')::int AS dedicated_desk_count,
         COUNT(ms.id) FILTER (WHERE ms.plan_type = 'private_office'  AND ms.status = 'active')::int AS private_office_count
       FROM members m
       LEFT JOIN memberships ms ON ms.member_id = m.id
       WHERE m.location_id = $1`,
      [locationId]
    ),
  ]);

  const ms    = memberRes.rows[0];
  const total = ms.total_members || 1;

  return {
    location:      locRes.rows[0],
    heatmap:       heatmapRes.rows,
    revenue_chart: revenueRes.rows,
    churn_risk: {
      expiring_soon: expiringSoonRes.rows,
      inactive:      inactiveRes.rows,
    },
    member_stats: {
      ...ms,
      day_pass_pct:       Math.round((ms.day_pass_count       / total) * 100),
      hot_desk_pct:       Math.round((ms.hot_desk_count       / total) * 100),
      dedicated_desk_pct: Math.round((ms.dedicated_desk_count / total) * 100),
      private_office_pct: Math.round((ms.private_office_count / total) * 100),
    },
  };
}

// ── Members list with live status (pagination + search) ──────────────────────
async function getMembersWithStatus(locationId, search, page, limit) {
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT
       m.id, m.name, m.email, m.phone, m.status, m.created_at,
       l.name AS location_name,
       ms.plan_type, ms.start_date, ms.end_date, ms.status AS membership_status,
       ms.id AS membership_id,
       ci.id AS active_checkin_id,
       ci.checked_in AS checked_in_at,
       CASE
         WHEN ci.id IS NOT NULL THEN 'checked_in'
         WHEN ms.end_date < NOW() THEN 'expired'
         WHEN ms.end_date <= NOW() + INTERVAL '7 days' THEN 'expiring_soon'
         WHEN m.status = 'inactive' THEN 'inactive'
         WHEN m.status = 'frozen' THEN 'frozen'
         ELSE 'active'
       END AS display_status
     FROM members m
     LEFT JOIN locations l ON m.location_id = l.id
     LEFT JOIN memberships ms ON ms.member_id = m.id
       AND ms.status = 'active'
       AND ms.end_date = (
         SELECT MAX(end_date) FROM memberships
         WHERE member_id = m.id AND status = 'active'
       )
     LEFT JOIN checkins ci ON ci.member_id = m.id AND ci.checked_out IS NULL
     WHERE
       ($1::uuid IS NULL OR m.location_id = $1)
       AND ($2 = '' OR m.name ILIKE '%' || $2 || '%' OR m.email ILIKE '%' || $2 || '%')
     ORDER BY m.created_at DESC
     LIMIT $3 OFFSET $4`,
    [locationId || null, search || '', limit, offset]
  );
  return rows;
}

async function getMembersCount(locationId, search) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM members m
     WHERE ($1::uuid IS NULL OR m.location_id = $1)
       AND ($2 = '' OR m.name ILIKE '%' || $2 || '%' OR m.email ILIKE '%' || $2 || '%')`,
    [locationId || null, search || '']
  );
  return rows[0].total;
}

async function getActiveMembership(memberId) {
  const { rows } = await pool.query(
    `SELECT * FROM memberships
     WHERE member_id = $1 AND status = 'active'
     ORDER BY end_date DESC LIMIT 1`,
    [memberId]
  );
  return rows[0] || null;
}

async function getOpenCheckin(memberId) {
  const { rows } = await pool.query(
    `SELECT id, checked_in FROM checkins
     WHERE member_id = $1 AND checked_out IS NULL LIMIT 1`,
    [memberId]
  );
  return rows[0] || null;
}

// ── Q5: Cross-location revenue comparison (< 2ms) ────────────────────────────
/**
 * Revenue totals for all locations over the last 30 days.
 * Uses: idx_payments_date (paid_at DESC) — date filter, then GROUP BY location
 */
async function getCrossLocationRevenue() {
  const { rows } = await pool.query(`
    SELECT
      l.id          AS location_id,
      l.name        AS location_name,
      l.city,
      COALESCE(SUM(p.amount), 0)::float AS total_revenue,
      COUNT(p.id)::int                  AS payment_count
    FROM locations l
    LEFT JOIN payments p
      ON p.location_id = l.id
     AND p.paid_at >= NOW() - INTERVAL '30 days'
    GROUP BY l.id, l.name, l.city
    ORDER BY total_revenue DESC
  `);
  return rows;
}

// ── Q6: Active anomalies (< 0.3ms) ───────────────────────────────────────────
/**
 * All unresolved anomalies, optionally filtered by location_id and/or severity.
 * Uses: idx_anomalies_active (partial WHERE resolved=FALSE)
 */
async function getActiveAnomalies({ locationId, severity } = {}) {
  const params = [];
  let where    = 'WHERE a.resolved = FALSE';

  if (locationId) {
    params.push(locationId);
    where += ` AND a.location_id = $${params.length}`;
  }
  if (severity) {
    params.push(severity);
    where += ` AND a.severity = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT
       a.id, a.location_id, l.name AS location_name,
       a.type, a.severity, a.message,
       a.resolved, a.dismissed,
       a.detected_at, a.resolved_at
     FROM anomalies a
     JOIN locations l ON l.id = a.location_id
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
  if (!anomaly)                        return { error: 'not_found' };
  if (anomaly.severity === 'critical') return { error: 'forbidden' };
  if (anomaly.resolved)                return { error: 'already_resolved' };

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
  getAllLocationsWithStats,
  getLocationLive,
  getLocationAnalytics,
  getCrossLocationRevenue,
  getActiveAnomalies,
  getAnomalyById,
  dismissAnomaly,
  getMembersWithStatus,
  getMembersCount,
  getActiveMembership,
  getOpenCheckin,
};
