/**
 * Anomaly Service — detection logic and auto-resolve for all 4 anomaly types.
 *
 * Types:
 *   no_activity   — active location, no check-ins in last 2 hours during opens_at→closes_at → WARNING
 *   overbooking   — occupancy > 90% of (hot_desks + dedicated_desks + private_offices)       → CRITICAL
 *   revenue_drop  — today < 70% of same weekday last week                                     → WARNING
 *   high_no_show  — >30% of today's confirmed bookings are no_show                            → WARNING
 *
 * Auto-resolve rules:
 *   no_activity:  any check-in recorded at the location
 *   overbooking:  occupancy drops below 85%
 *   revenue_drop: today's revenue ≥ 80% of last week's same-day figure
 *   high_no_show: no_show rate drops below 20%
 */

const pool   = require('../db/pool');
const logger = require('../utils/logger');
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

// ── Detector: no_activity ─────────────────────────────────────────────────────
async function detectNoActivity() {
  const { rows: locations } = await pool.query(
    `SELECT id, name, opens_at::text, closes_at::text FROM locations WHERE status = 'active'`
  );

  const nowMin = _time.getNowMinutes();

  for (const loc of locations) {
    const opensMin  = parseTimeToMinutes(loc.opens_at);
    const closesMin = parseTimeToMinutes(loc.closes_at);

    if (nowMin < opensMin || nowMin > closesMin) continue;

    const { rows: recent } = await pool.query(
      `SELECT COUNT(*)::int AS cnt
       FROM checkins
       WHERE location_id = $1 AND checked_in >= NOW() - INTERVAL '2 hours'`,
      [loc.id]
    );

    const hasActivity = recent[0].cnt > 0;

    if (!hasActivity) {
      const { rows: existing } = await pool.query(
        `SELECT id FROM anomalies
         WHERE location_id = $1 AND type = 'no_activity' AND resolved = FALSE
         LIMIT 1`,
        [loc.id]
      );

      if (existing.length === 0) {
        const msg = `No check-ins recorded at ${loc.name} in the last 2 hours during operating hours`;
        const { rows: created } = await pool.query(
          `INSERT INTO anomalies (location_id, type, severity, message)
           VALUES ($1, 'no_activity', 'warning', $2)
           RETURNING id`,
          [loc.id, msg]
        );

        broadcastAnomalyDetected({
          anomaly_id:    created[0].id,
          location_id:   loc.id,
          location_name: loc.name,
          anomaly_type:  'no_activity',
          severity:      'warning',
          message:       msg,
        });
      }
    } else {
      const { rows: resolved } = await pool.query(
        `UPDATE anomalies
         SET resolved = TRUE, resolved_at = NOW()
         WHERE location_id = $1 AND type = 'no_activity' AND resolved = FALSE
         RETURNING id`,
        [loc.id]
      );

      for (const r of resolved) {
        broadcastAnomalyResolved({
          anomaly_id:  r.id,
          location_id: loc.id,
          resolved_at: new Date().toISOString(),
        });
      }
    }
  }
}

// ── Detector: overbooking ─────────────────────────────────────────────────────
async function detectOverbooking() {
  // Capacity = total_hot_desks + total_dedicated_desks + total_private_offices
  // Uses idx_checkins_live_occupancy via the LEFT JOIN
  const { rows: locations } = await pool.query(`
    SELECT
      l.id, l.name,
      (l.total_hot_desks + l.total_dedicated_desks + l.total_private_offices) AS capacity,
      COUNT(c.id)::int AS occupancy
    FROM locations l
    LEFT JOIN checkins c
      ON c.location_id = l.id AND c.checked_out IS NULL
    WHERE l.status = 'active'
    GROUP BY l.id, l.name, l.total_hot_desks, l.total_dedicated_desks, l.total_private_offices
  `);

  for (const loc of locations) {
    const pct = loc.capacity > 0 ? (loc.occupancy / loc.capacity) * 100 : 0;

    if (pct > 90) {
      const { rows: existing } = await pool.query(
        `SELECT id FROM anomalies
         WHERE location_id = $1 AND type = 'overbooking' AND resolved = FALSE
         LIMIT 1`,
        [loc.id]
      );

      if (existing.length === 0) {
        const msg = `${loc.name} at ${Math.round(pct)}% capacity (${loc.occupancy}/${loc.capacity} desks occupied)`;
        const { rows: created } = await pool.query(
          `INSERT INTO anomalies (location_id, type, severity, message)
           VALUES ($1, 'overbooking', 'critical', $2)
           RETURNING id`,
          [loc.id, msg]
        );

        broadcastAnomalyDetected({
          anomaly_id:    created[0].id,
          location_id:   loc.id,
          location_name: loc.name,
          anomaly_type:  'overbooking',
          severity:      'critical',
          message:       msg,
        });
      }
    } else if (pct < 85) {
      const { rows: resolved } = await pool.query(
        `UPDATE anomalies
         SET resolved = TRUE, resolved_at = NOW()
         WHERE location_id = $1 AND type = 'overbooking' AND resolved = FALSE
         RETURNING id`,
        [loc.id]
      );

      for (const r of resolved) {
        broadcastAnomalyResolved({
          anomaly_id:  r.id,
          location_id: loc.id,
          resolved_at: new Date().toISOString(),
        });
      }
    }
    // 85–90%: existing anomaly stays open, no new one created
  }
}

// ── Detector: revenue_drop ────────────────────────────────────────────────────
async function detectRevenueDrop() {
  const { rows: locations } = await pool.query(
    `SELECT id, name FROM locations WHERE status = 'active'`
  );

  for (const loc of locations) {
    // idx_payments_location_date handles location_id + date filter
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
       WHERE location_id = $1
         AND paid_at >= CURRENT_DATE - 8`,
      [loc.id]
    );

    const { today_rev, last_week_rev } = rows[0];

    if (last_week_rev < 1000) continue;

    const ratio = today_rev / last_week_rev;

    if (ratio < 0.70) {
      const { rows: existing } = await pool.query(
        `SELECT id FROM anomalies
         WHERE location_id = $1 AND type = 'revenue_drop' AND resolved = FALSE
         LIMIT 1`,
        [loc.id]
      );

      if (existing.length === 0) {
        const msg = `Revenue at ${loc.name} is ₹${today_rev.toFixed(0)} today vs ₹${last_week_rev.toFixed(0)} same day last week (${Math.round(ratio * 100)}% of last week)`;
        const { rows: created } = await pool.query(
          `INSERT INTO anomalies (location_id, type, severity, message)
           VALUES ($1, 'revenue_drop', 'warning', $2)
           RETURNING id`,
          [loc.id, msg]
        );

        broadcastAnomalyDetected({
          anomaly_id:    created[0].id,
          location_id:   loc.id,
          location_name: loc.name,
          anomaly_type:  'revenue_drop',
          severity:      'warning',
          message:       msg,
        });
      }
    } else if (ratio >= 0.80) {
      const { rows: resolved } = await pool.query(
        `UPDATE anomalies
         SET resolved = TRUE, resolved_at = NOW()
         WHERE location_id = $1 AND type = 'revenue_drop' AND resolved = FALSE
         RETURNING id`,
        [loc.id]
      );

      for (const r of resolved) {
        broadcastAnomalyResolved({
          anomaly_id:  r.id,
          location_id: loc.id,
          resolved_at: new Date().toISOString(),
        });
      }
    }
  }
}

// ── Detector: high_no_show ────────────────────────────────────────────────────
async function detectHighNoShow() {
  const { rows: locations } = await pool.query(
    `SELECT id, name FROM locations WHERE status = 'active'`
  );

  for (const loc of locations) {
    // Count confirmed + no_show bookings for today
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'no_show')::int  AS no_show_count,
         COUNT(*)::int                                    AS total_count
       FROM bookings
       WHERE location_id = $1
         AND starts_at >= CURRENT_DATE
         AND starts_at <  CURRENT_DATE + INTERVAL '1 day'
         AND status IN ('confirmed', 'no_show')`,
      [loc.id]
    );

    const { no_show_count, total_count } = rows[0];

    if (total_count === 0) continue;

    const noShowRate = no_show_count / total_count;

    if (noShowRate > 0.30) {
      const { rows: existing } = await pool.query(
        `SELECT id FROM anomalies
         WHERE location_id = $1 AND type = 'high_no_show' AND resolved = FALSE
         LIMIT 1`,
        [loc.id]
      );

      if (existing.length === 0) {
        const pct = Math.round(noShowRate * 100);
        const msg = `${loc.name}: ${pct}% no-show rate today (${no_show_count}/${total_count} bookings)`;
        const { rows: created } = await pool.query(
          `INSERT INTO anomalies (location_id, type, severity, message)
           VALUES ($1, 'high_no_show', 'warning', $2)
           RETURNING id`,
          [loc.id, msg]
        );

        broadcastAnomalyDetected({
          anomaly_id:    created[0].id,
          location_id:   loc.id,
          location_name: loc.name,
          anomaly_type:  'high_no_show',
          severity:      'warning',
          message:       msg,
        });
      }
    } else if (noShowRate < 0.20) {
      // Auto-resolve when rate drops below 20%
      const { rows: resolved } = await pool.query(
        `UPDATE anomalies
         SET resolved = TRUE, resolved_at = NOW()
         WHERE location_id = $1 AND type = 'high_no_show' AND resolved = FALSE
         RETURNING id`,
        [loc.id]
      );

      for (const r of resolved) {
        broadcastAnomalyResolved({
          anomaly_id:  r.id,
          location_id: loc.id,
          resolved_at: new Date().toISOString(),
        });
      }
    }
  }
}

// ── Public facade ─────────────────────────────────────────────────────────────
/**
 * Run all four detectors concurrently.
 * Called by the anomaly detector cron job every 30 seconds.
 */
async function detectAllAnomalies() {
  try {
    await Promise.all([
      detectNoActivity(),
      detectOverbooking(),
      detectRevenueDrop(),
      detectHighNoShow(),
    ]);
  } catch (err) {
    logger.error({ err: err.message }, '[anomalyService] Detection cycle error');
  }
}

module.exports = {
  detectNoActivity,
  detectOverbooking,
  detectRevenueDrop,
  detectHighNoShow,
  detectAllAnomalies,
  // Exported for testing — override _time.getNowMinutes to control time checks
  _time,
  _parseTimeToMinutes: parseTimeToMinutes,
};
