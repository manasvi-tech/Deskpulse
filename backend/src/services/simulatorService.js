/**
 * Simulator Service
 * Generates realistic check-in / checkout / payment events directly to PostgreSQL
 * and broadcasts them via WebSocket.
 *
 * Hourly weights from CLAUDE.md:
 *   00–07: 0.00 (closed)     |  08: 0.40 (early arrival)
 *   09–11: 1.00 (peak)       |  12–13: 0.50 (lunch dip)
 *   14–17: 0.90 (afternoon)  |  18–19: 0.40 (evening wind-down)
 *   20–22: 0.15 (late)       |  23: 0.00 (closed)
 *
 * Speed multiplier: 1x / 5x / 10x (reduces the tick interval).
 */

const pool = require('../db/pool');
const {
  broadcastCheckin,
  broadcastCheckout,
  broadcastPayment,
} = require('../websocket/broadcast');

// ── Constants ─────────────────────────────────────────────────────────────────
const HOURLY_WEIGHTS = [
  0.00, 0.00, 0.00, 0.00, 0.00, 0.00, // 00–05: closed
  0.00, 0.00, 0.40, 1.00, 1.00, 1.00, // 06–11: 06–07 closed, 08 early, 09–11 peak
  0.50, 0.50, 0.90, 0.90, 0.90, 0.90, // 12–17: 12–13 lunch dip, 14–17 afternoon peak
  0.40, 0.40, 0.15, 0.15, 0.15, 0.00, // 18–23: 18–19 evening, 20–22 late evening, 23 closed
];

// Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
const DOW_WEIGHTS = [0.20, 0.85, 0.95, 1.00, 0.95, 0.80, 0.40];

const PLAN_AMOUNTS = {
  day_pass:       499,
  hot_desk:      3999,
  dedicated_desk: 7999,
  private_office: 24999,
};

const BASE_INTERVAL_MS = parseInt(process.env.SIMULATOR_INTERVAL_MS, 10) || 2000;

// ── Simulator state ───────────────────────────────────────────────────────────
const _state = {
  running:    false,
  speed:      1,
  intervalId: null,
};

// ── Testable time utilities ───────────────────────────────────────────────────
const _time = {
  getHour: () => new Date().getHours(),
  getDow:  () => new Date().getDay(),
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function getHourWeight() {
  return HOURLY_WEIGHTS[_time.getHour()];
}

function getDowWeight() {
  return DOW_WEIGHTS[_time.getDow()];
}

async function getRandomActiveLocation() {
  const { rows } = await pool.query(
    `SELECT id, name,
       total_hot_desks + total_dedicated_desks + total_private_offices AS capacity
     FROM locations
     WHERE status = 'active'
     ORDER BY random()
     LIMIT 1`
  );
  return rows[0] || null;
}

async function getRandomActiveMember(locationId) {
  const { rows } = await pool.query(
    `SELECT id, name
     FROM members
     WHERE location_id = $1 AND status = 'active'
     ORDER BY random()
     LIMIT 1`,
    [locationId]
  );
  return rows[0] || null;
}

async function getLocationOccupancy(locationId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM checkins
     WHERE location_id = $1 AND checked_out IS NULL`,
    [locationId]
  );
  return rows[0].cnt;
}

// ── Event generators ──────────────────────────────────────────────────────────

/**
 * Simulate one check-in:
 *   - Picks a random active location
 *   - Ensures capacity not exceeded
 *   - Picks a random active member without an open check-in
 *   - Writes to DB and broadcasts CHECKIN_EVENT
 */
async function simulateCheckin() {
  const location = await getRandomActiveLocation();
  if (!location) return;

  const occupancy = await getLocationOccupancy(location.id);
  if (occupancy >= location.capacity) return;

  const member = await getRandomActiveMember(location.id);
  if (!member) return;

  // Skip if member already has an open check-in
  const { rows: openCI } = await pool.query(
    `SELECT id FROM checkins
     WHERE member_id = $1 AND checked_out IS NULL
     LIMIT 1`,
    [member.id]
  );
  if (openCI.length > 0) return;

  const now = new Date().toISOString();

  await pool.query(
    `INSERT INTO checkins (member_id, location_id, checked_in)
     VALUES ($1, $2, NOW())`,
    [member.id, location.id]
  );

  const newOccupancy = occupancy + 1;
  const capacityPct  = location.capacity > 0
    ? Math.round((newOccupancy / location.capacity) * 1000) / 10
    : 0;

  broadcastCheckin({
    location_id:       location.id,
    member_name:       member.name,
    timestamp:         now,
    current_occupancy: newOccupancy,
    capacity_pct:      capacityPct,
  });
}

/**
 * Simulate one checkout:
 *   - Picks a random open check-in across all locations
 *   - Closes it and broadcasts CHECKOUT_EVENT
 */
async function simulateCheckout() {
  // Uses idx_checkins_live_occupancy for the WHERE checked_out IS NULL filter
  const { rows } = await pool.query(`
    SELECT c.id, c.member_id, c.location_id,
           m.name AS member_name,
           (l.total_hot_desks + l.total_dedicated_desks + l.total_private_offices) AS capacity
    FROM checkins c
    JOIN members   m ON m.id = c.member_id
    JOIN locations l ON l.id = c.location_id
    WHERE c.checked_out IS NULL
    ORDER BY random()
    LIMIT 1
  `);
  if (rows.length === 0) return;

  const ci = rows[0];

  await pool.query(
    `UPDATE checkins SET checked_out = NOW() WHERE id = $1`,
    [ci.id]
  );

  const newOccupancy = await getLocationOccupancy(ci.location_id);
  const capacityPct  = ci.capacity > 0
    ? Math.round((newOccupancy / ci.capacity) * 1000) / 10
    : 0;

  broadcastCheckout({
    location_id:       ci.location_id,
    member_name:       ci.member_name,
    timestamp:         new Date().toISOString(),
    current_occupancy: newOccupancy,
    capacity_pct:      capacityPct,
  });
}

/**
 * Simulate one payment:
 *   - Picks a random active member with an active membership from a random location
 *   - Inserts a renewal payment and broadcasts PAYMENT_EVENT
 */
async function simulatePayment() {
  const location = await getRandomActiveLocation();
  if (!location) return;

  // Get a member with an active membership for this location
  const { rows } = await pool.query(
    `SELECT m.id, m.name, ms.id AS membership_id, ms.plan_type
     FROM members m
     JOIN memberships ms ON ms.member_id = m.id AND ms.status = 'active'
     WHERE m.location_id = $1 AND m.status = 'active'
     ORDER BY random()
     LIMIT 1`,
    [location.id]
  );
  if (rows.length === 0) return;

  const { id: memberId, name: memberName, membership_id, plan_type } = rows[0];
  const amount = PLAN_AMOUNTS[plan_type] || 3999;

  await pool.query(
    `INSERT INTO payments (member_id, membership_id, location_id, amount, payment_type, paid_at)
     VALUES ($1, $2, $3, $4, 'renewal', NOW())`,
    [memberId, membership_id, location.id, amount]
  );

  // Today's total for this location (idx_payments_location_date)
  const { rows: totals } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS total
     FROM payments
     WHERE location_id = $1 AND paid_at >= CURRENT_DATE`,
    [location.id]
  );

  broadcastPayment({
    location_id:  location.id,
    amount,
    plan_type,
    member_name:  memberName,
    today_total:  totals[0].total,
  });
}

// ── Tick ──────────────────────────────────────────────────────────────────────
/**
 * One simulation tick.
 * Decision weights based on current time of day and day of week.
 * A minimum floor of 0.35 ensures events always fire when the simulator
 * is explicitly running, regardless of the container's UTC hour.
 */
async function tick() {
  try {
    const hw = getHourWeight();
    const dw = getDowWeight();

    // Floor ensures the simulator always generates events when running.
    // Without this, UTC 00–08 and UTC 22–23 would silently produce nothing.
    const MIN_FLOOR = 0.35;
    const activity  = Math.max(hw * dw, MIN_FLOOR);
    const rand      = Math.random();

    if (rand < activity * 0.50) {
      await simulateCheckin();
    } else if (rand < activity * 0.70) {
      await simulateCheckout();
    } else if (rand < activity * 0.75) {
      await simulatePayment();
    }
  } catch (err) {
    console.error('[simulator] Tick error:', err.message);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

function start(speed = 1) {
  if (_state.running) return { status: 'already_running', speed: _state.speed };

  _state.running    = true;
  _state.speed      = speed;

  const interval = Math.max(200, Math.round(BASE_INTERVAL_MS / speed));
  _state.intervalId = setInterval(tick, interval);

  console.log(`[simulator] Started at ${speed}x speed (interval: ${interval}ms)`);
  return { status: 'running', speed };
}

function stop() {
  if (!_state.running) return { status: 'already_stopped' };

  clearInterval(_state.intervalId);
  _state.intervalId = null;
  _state.running    = false;

  console.log('[simulator] Stopped');
  return { status: 'stopped' };
}

async function reset() {
  stop();
  await pool.query(
    `UPDATE checkins SET checked_out = NOW() WHERE checked_out IS NULL`
  );
  console.log('[simulator] Reset: all open check-ins closed');
  return { status: 'reset' };
}

function getState() {
  return { running: _state.running, speed: _state.speed };
}

module.exports = {
  start,
  stop,
  reset,
  getState,
  tick,
  simulateCheckin,
  simulateCheckout,
  simulatePayment,
  HOURLY_WEIGHTS,
  DOW_WEIGHTS,
  _time,
};
