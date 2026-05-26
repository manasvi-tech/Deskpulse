/**
 * Anomaly Service — detection logic and auto-resolve for all 3 anomaly types.
 *
 * Types:
 *   zero_checkins   — active gym, no check-ins in last 2 hours during opens_at→closes_at → WARNING
 *   capacity_breach — occupancy > 90% of capacity                                        → CRITICAL
 *   revenue_drop    — today < 70% of same weekday last week                               → WARNING
 *
 * Auto-resolve rules:
 *   zero_checkins:   any check-in recorded at the gym
 *   capacity_breach: occupancy drops below 85%
 *   revenue_drop:    today's revenue ≥ 80% of last week's same-day figure
 */

const pool = require('../db/pool');
const {
  broadcastAnomalyDetected,
  broadcastAnomalyResolved,
} = require('../websocket/broadcast');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Time utilities — exposed on module.exports._time so unit tests can swap
 * getNowMinutes() without fighting JavaScript's timezone handling.
 */
const _time = {
  /** Returns minutes since midnight for the current wall-clock time. */
  getNowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  },
};

/** Parse 'HH:MM' or 'HH:MM:SS' to minutes since midnight. */
function parseTimeToMinutes(timeStr) {
  const parts = timeStr.split(':').map(Number);
  return parts[0] * 60 + (parts[1] || 0);
}

// ── Detector: zero_checkins ───────────────────────────────────────────────────
async function detectZeroCheckins() {
  const { rows: gyms } = await pool.query(
    `SELECT id, name, opens_at::text, closes_at::text FROM gyms WHERE status = 'active'`
  );

  const nowMin = _time.getNowMinutes();

  for (const gym of gyms) {
    const opensMin  = parseTimeToMinutes(gym.opens_at);
    const closesMin = parseTimeToMinutes(gym.closes_at);

    // Only flag if we are currently inside operating hours
    if (nowMin < opensMin || nowMin > closesMin) continue;

    // Check for any check-in in the last 2 hours
    const { rows: recent } = await pool.query(
      `SELECT COUNT(*)::int AS cnt
       FROM checkins
       WHERE gym_id = $1 AND checked_in >= NOW() - INTERVAL '2 hours'`,
      [gym.id]
    );

    const hasActivity = recent[0].cnt > 0;

    if (!hasActivity) {
      // Create if no open anomaly already exists for this gym+type
      const { rows: existing } = await pool.query(
        `SELECT id FROM anomalies
         WHERE gym_id = $1 AND type = 'zero_checkins' AND resolved = FALSE
         LIMIT 1`,
        [gym.id]
      );

      if (existing.length === 0) {
        const msg = `No check-ins recorded at ${gym.name} in the last 2 hours during operating hours`;
        const { rows: created } = await pool.query(
          `INSERT INTO anomalies (gym_id, type, severity, message)
           VALUES ($1, 'zero_checkins', 'warning', $2)
           RETURNING id`,
          [gym.id, msg]
        );

        broadcastAnomalyDetected({
          anomaly_id:   created[0].id,
          gym_id:       gym.id,
          gym_name:     gym.name,
          anomaly_type: 'zero_checkins',
          severity:     'warning',
          message:      msg,
        });
      }
    } else {
      // Auto-resolve: check-in recorded → resolve all open zero_checkins for this gym
      const { rows: resolved } = await pool.query(
        `UPDATE anomalies
         SET resolved = TRUE, resolved_at = NOW()
         WHERE gym_id = $1 AND type = 'zero_checkins' AND resolved = FALSE
         RETURNING id`,
        [gym.id]
      );

      for (const r of resolved) {
        broadcastAnomalyResolved({
          anomaly_id:  r.id,
          gym_id:      gym.id,
          resolved_at: new Date().toISOString(),
        });
      }
    }
  }
}

// ── Detector: capacity_breach ─────────────────────────────────────────────────
async function detectCapacityBreach() {
  // Single query: get all active gyms with their current open check-in count
  // Uses idx_checkins_live_occupancy via the correlated subquery
  const { rows: gyms } = await pool.query(`
    SELECT
      g.id, g.name, g.capacity,
      COUNT(c.id)::int AS occupancy
    FROM gyms g
    LEFT JOIN checkins c
      ON c.gym_id = g.id AND c.checked_out IS NULL
    WHERE g.status = 'active'
    GROUP BY g.id, g.name, g.capacity
  `);

  for (const gym of gyms) {
    const pct = gym.capacity > 0 ? (gym.occupancy / gym.capacity) * 100 : 0;

    if (pct > 90) {
      const { rows: existing } = await pool.query(
        `SELECT id FROM anomalies
         WHERE gym_id = $1 AND type = 'capacity_breach' AND resolved = FALSE
         LIMIT 1`,
        [gym.id]
      );

      if (existing.length === 0) {
        const msg = `${gym.name} at ${Math.round(pct)}% capacity (${gym.occupancy}/${gym.capacity} members currently checked in)`;
        const { rows: created } = await pool.query(
          `INSERT INTO anomalies (gym_id, type, severity, message)
           VALUES ($1, 'capacity_breach', 'critical', $2)
           RETURNING id`,
          [gym.id, msg]
        );

        broadcastAnomalyDetected({
          anomaly_id:   created[0].id,
          gym_id:       gym.id,
          gym_name:     gym.name,
          anomaly_type: 'capacity_breach',
          severity:     'critical',
          message:      msg,
        });
      }
    } else if (pct < 85) {
      // Auto-resolve when occupancy drops below 85%
      const { rows: resolved } = await pool.query(
        `UPDATE anomalies
         SET resolved = TRUE, resolved_at = NOW()
         WHERE gym_id = $1 AND type = 'capacity_breach' AND resolved = FALSE
         RETURNING id`,
        [gym.id]
      );

      for (const r of resolved) {
        broadcastAnomalyResolved({
          anomaly_id:  r.id,
          gym_id:      gym.id,
          resolved_at: new Date().toISOString(),
        });
      }
    }
    // 85–90%: existing anomaly stays open, no new one created
  }
}

// ── Detector: revenue_drop ────────────────────────────────────────────────────
async function detectRevenueDrop() {
  const { rows: gyms } = await pool.query(
    `SELECT id, name FROM gyms WHERE status = 'active'`
  );

  for (const gym of gyms) {
    // Fetch today's revenue and same weekday last week in one query
    // idx_payments_gym_date handles the gym_id + date filter
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(
           CASE WHEN paid_at >= CURRENT_DATE THEN amount ELSE 0 END
         ), 0)::float AS today_rev,
         COALESCE(SUM(
           CASE
             WHEN paid_at >= (CURRENT_DATE - 7)
              AND paid_at <  (CURRENT_DATE - 6)
             THEN amount ELSE 0
           END
         ), 0)::float AS last_week_rev
       FROM payments
       WHERE gym_id = $1
         AND paid_at >= CURRENT_DATE - 8`,
      [gym.id]
    );

    const { today_rev, last_week_rev } = rows[0];

    // Require meaningful last-week revenue to avoid false positives on new gyms
    if (last_week_rev < 1000) continue;

    const ratio = today_rev / last_week_rev;

    if (ratio < 0.70) {
      // Create anomaly if none is open
      const { rows: existing } = await pool.query(
        `SELECT id FROM anomalies
         WHERE gym_id = $1 AND type = 'revenue_drop' AND resolved = FALSE
         LIMIT 1`,
        [gym.id]
      );

      if (existing.length === 0) {
        const msg = `Revenue at ${gym.name} is ₹${today_rev.toFixed(0)} today vs ₹${last_week_rev.toFixed(0)} same day last week (${Math.round(ratio * 100)}% of last week)`;
        const { rows: created } = await pool.query(
          `INSERT INTO anomalies (gym_id, type, severity, message)
           VALUES ($1, 'revenue_drop', 'warning', $2)
           RETURNING id`,
          [gym.id, msg]
        );

        broadcastAnomalyDetected({
          anomaly_id:   created[0].id,
          gym_id:       gym.id,
          gym_name:     gym.name,
          anomaly_type: 'revenue_drop',
          severity:     'warning',
          message:      msg,
        });
      }
    } else if (ratio >= 0.80) {
      // Auto-resolve: revenue recovered to within 20% of last week
      const { rows: resolved } = await pool.query(
        `UPDATE anomalies
         SET resolved = TRUE, resolved_at = NOW()
         WHERE gym_id = $1 AND type = 'revenue_drop' AND resolved = FALSE
         RETURNING id`,
        [gym.id]
      );

      for (const r of resolved) {
        broadcastAnomalyResolved({
          anomaly_id:  r.id,
          gym_id:      gym.id,
          resolved_at: new Date().toISOString(),
        });
      }
    }
  }
}

// ── Public facade ─────────────────────────────────────────────────────────────
/**
 * Run all three detectors concurrently.
 * Called by the anomaly detector cron job every 30 seconds.
 */
async function detectAllAnomalies() {
  try {
    await Promise.all([
      detectZeroCheckins(),
      detectCapacityBreach(),
      detectRevenueDrop(),
    ]);
  } catch (err) {
    console.error('[anomalyService] Detection cycle error:', err.message);
  }
}

module.exports = {
  detectZeroCheckins,
  detectCapacityBreach,
  detectRevenueDrop,
  detectAllAnomalies,
  // Exported for testing — override _time.getNowMinutes to control time checks
  _time,
  _parseTimeToMinutes: parseTimeToMinutes,
};
