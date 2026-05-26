/**
 * Simulator Service
 * Generates realistic check-in / checkout / payment events directly to PostgreSQL
 * and broadcasts them via WebSocket.
 *
 * Hourly weights mirror the seed data distribution from CLAUDE.md:
 *   00-05: 0.00 (closed)  |  05-06: 0.60  |  07-09: 1.00 (peak)
 *   10-11: 0.40           |  12-13: 0.30  |  14-16: 0.20
 *   17-20: 0.90 (peak)    |  21-22: 0.35  |  23: 0.00 (closed)
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
  0.00, 0.00, 0.00, 0.00, 0.00, 0.60, // 00–05
  0.60, 1.00, 1.00, 1.00, 0.40, 0.40, // 06–11
  0.30, 0.30, 0.20, 0.20, 0.20, 0.90, // 12–17
  0.90, 0.90, 0.90, 0.35, 0.35, 0.00, // 18–23
];

const DOW_WEIGHTS = [0.45, 1.00, 0.95, 0.90, 0.95, 0.85, 0.70]; // Sun → Sat

const PLAN_AMOUNTS = { monthly: 1499, quarterly: 3999, annual: 11999 };

const BASE_INTERVAL_MS = parseInt(process.env.SIMULATOR_INTERVAL_MS, 10) || 2000;

// ── Simulator state ───────────────────────────────────────────────────────────
const _state = {
  running:    false,
  speed:      1,
  intervalId: null,
};

// ── Testable time utilities ───────────────────────────────────────────────────
/**
 * Exposed as _time so unit tests can override getHour/getDow without
 * fighting Jest's timezone handling of fake timers.
 */
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

async function getRandomActiveGym() {
  const { rows } = await pool.query(
    `SELECT id, name, capacity
     FROM gyms
     WHERE status = 'active'
     ORDER BY random()
     LIMIT 1`
  );
  return rows[0] || null;
}

async function getRandomActiveMember(gymId) {
  const { rows } = await pool.query(
    `SELECT id, name, plan_type
     FROM members
     WHERE gym_id = $1 AND status = 'active'
     ORDER BY random()
     LIMIT 1`,
    [gymId]
  );
  return rows[0] || null;
}

async function getGymOccupancy(gymId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM checkins
     WHERE gym_id = $1 AND checked_out IS NULL`,
    [gymId]
  );
  return rows[0].cnt;
}

// ── Event generators ──────────────────────────────────────────────────────────

/**
 * Simulate one check-in:
 *   - Picks a random active gym
 *   - Ensures capacity not exceeded
 *   - Picks a random active member without an open check-in
 *   - Writes to DB and broadcasts CHECKIN_EVENT
 */
async function simulateCheckin() {
  const gym = await getRandomActiveGym();
  if (!gym) return;

  const occupancy = await getGymOccupancy(gym.id);
  if (occupancy >= gym.capacity) return; // gym full

  const member = await getRandomActiveMember(gym.id);
  if (!member) return;

  // Skip if member already has an open check-in (idempotency)
  const { rows: openCI } = await pool.query(
    `SELECT id FROM checkins
     WHERE member_id = $1 AND checked_out IS NULL
     LIMIT 1`,
    [member.id]
  );
  if (openCI.length > 0) return;

  const now = new Date().toISOString();

  await pool.query(
    `INSERT INTO checkins (member_id, gym_id, checked_in)
     VALUES ($1, $2, NOW())`,
    [member.id, gym.id]
  );

  // Keep members.last_checkin_at in sync
  await pool.query(
    `UPDATE members SET last_checkin_at = NOW() WHERE id = $1`,
    [member.id]
  );

  const newOccupancy = occupancy + 1;
  const capacityPct  = gym.capacity > 0
    ? Math.round((newOccupancy / gym.capacity) * 1000) / 10
    : 0;

  broadcastCheckin({
    gym_id:           gym.id,
    member_name:      member.name,
    timestamp:        now,
    current_occupancy: newOccupancy,
    capacity_pct:     capacityPct,
  });
}

/**
 * Simulate one checkout:
 *   - Picks a random open check-in across all gyms
 *   - Closes it and broadcasts CHECKOUT_EVENT
 */
async function simulateCheckout() {
  // Uses idx_checkins_live_occupancy for the WHERE checked_out IS NULL filter
  const { rows } = await pool.query(`
    SELECT c.id, c.member_id, c.gym_id,
           m.name AS member_name,
           g.capacity
    FROM checkins c
    JOIN members m ON m.id = c.member_id
    JOIN gyms    g ON g.id = c.gym_id
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

  const newOccupancy = await getGymOccupancy(ci.gym_id);
  const capacityPct  = ci.capacity > 0
    ? Math.round((newOccupancy / ci.capacity) * 1000) / 10
    : 0;

  broadcastCheckout({
    gym_id:           ci.gym_id,
    member_name:      ci.member_name,
    timestamp:        new Date().toISOString(),
    current_occupancy: newOccupancy,
    capacity_pct:     capacityPct,
  });
}

/**
 * Simulate one payment:
 *   - Picks a random active member from a random gym
 *   - Inserts a renewal payment and broadcasts PAYMENT_EVENT
 */
async function simulatePayment() {
  const gym = await getRandomActiveGym();
  if (!gym) return;

  const member = await getRandomActiveMember(gym.id);
  if (!member) return;

  const amount   = PLAN_AMOUNTS[member.plan_type] || 1499;
  const planType = member.plan_type;

  await pool.query(
    `INSERT INTO payments (member_id, gym_id, amount, plan_type, payment_type, paid_at)
     VALUES ($1, $2, $3, $4, 'renewal', NOW())`,
    [member.id, gym.id, amount, planType]
  );

  // Today's total for this gym (idx_payments_gym_date)
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::float AS total
     FROM payments
     WHERE gym_id = $1 AND paid_at >= CURRENT_DATE`,
    [gym.id]
  );

  broadcastPayment({
    gym_id:      gym.id,
    amount,
    plan_type:   planType,
    member_name: member.name,
    today_total: rows[0].total,
  });
}

// ── Tick ─────────────────────────────────────────────────────────────────────
/**
 * One simulation tick.
 * Decision weights based on current time of day and day of week.
 */
async function tick() {
  try {
    const hw = getHourWeight();
    const dw = getDowWeight();

    if (hw === 0) return; // outside operating hours — do nothing

    const activity = hw * dw; // 0..1 blended weight
    const rand     = Math.random();

    // During peak hours (activity ~0.90–1.00):
    //   ~50% chance of a check-in, ~20% checkout, ~5% payment
    if (rand < activity * 0.50) {
      await simulateCheckin();
    } else if (rand < activity * 0.70) {
      await simulateCheckout();
    } else if (rand < activity * 0.75) {
      await simulatePayment();
    }
    // else: quiet tick — nothing happens this interval
  } catch (err) {
    console.error('[simulator] Tick error:', err.message);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the simulator.
 * @param {1|5|10} speed — multiplier that reduces tick interval
 * @returns {{ status: string, speed: number }}
 */
function start(speed = 1) {
  if (_state.running) return { status: 'already_running', speed: _state.speed };

  _state.running    = true;
  _state.speed      = speed;

  // Shrink the interval for higher speeds; floor at 200ms
  const interval = Math.max(200, Math.round(BASE_INTERVAL_MS / speed));

  _state.intervalId = setInterval(tick, interval);

  console.log(`[simulator] Started at ${speed}x speed (interval: ${interval}ms)`);
  return { status: 'running', speed };
}

/**
 * Stop the simulator.
 * @returns {{ status: string }}
 */
function stop() {
  if (!_state.running) return { status: 'already_stopped' };

  clearInterval(_state.intervalId);
  _state.intervalId = null;
  _state.running    = false;

  console.log('[simulator] Stopped');
  return { status: 'stopped' };
}

/**
 * Reset: close all open check-ins and return to seeded baseline.
 * @returns {{ status: string }}
 */
async function reset() {
  stop();
  await pool.query(
    `UPDATE checkins SET checked_out = NOW() WHERE checked_out IS NULL`
  );
  console.log('[simulator] Reset: all open check-ins closed');
  return { status: 'reset' };
}

/**
 * Get current simulator state.
 * @returns {{ running: boolean, speed: number }}
 */
function getState() {
  return { running: _state.running, speed: _state.speed };
}

module.exports = {
  start,
  stop,
  reset,
  getState,
  tick,             // exported for unit tests
  simulateCheckin,  // exported for unit tests
  simulateCheckout, // exported for unit tests
  simulatePayment,  // exported for unit tests
  // Internal weight arrays exported for test assertions
  HOURLY_WEIGHTS,
  DOW_WEIGHTS,
  // Injectable time utilities — override in tests for timezone-safe assertions
  _time,
};
