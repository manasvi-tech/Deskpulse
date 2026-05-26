/**
 * Unit Tests — Simulator Service
 *
 * Verifies:
 *   • Start / stop / state transitions
 *   • Speed multiplier returns correct status
 *   • Hourly weight distribution matches CLAUDE.md spec (peak 7–9am and 5–8pm)
 *   • Day-of-week weights match CLAUDE.md spec
 *   • tick() skips closed hours (weight = 0), acts during open hours
 *   • reset() closes all open check-ins
 *
 * Uses _time injection for timezone-safe hour/dow mocking.
 */

// pool.js exports a pg.Pool instance — .query() is on Pool.prototype, NOT an
// own property, so Jest's auto-mock leaves it un-mocked.  Use a factory instead.
jest.mock('../../src/db/pool', () => ({
  query: jest.fn(),
  on:    jest.fn(),
}));
jest.mock('../../src/websocket/broadcast');

const pool      = require('../../src/db/pool');
const broadcast = require('../../src/websocket/broadcast');

const simulator = require('../../src/services/simulatorService');
const { HOURLY_WEIGHTS, DOW_WEIGHTS, _time } = simulator;

// ── Setup / teardown ──────────────────────────────────────────────────────────

let origGetHour, origGetDow;

beforeEach(() => {
  jest.clearAllMocks();
  broadcast.broadcastCheckin.mockImplementation(() => {});
  broadcast.broadcastCheckout.mockImplementation(() => {});
  broadcast.broadcastPayment.mockImplementation(() => {});
  origGetHour = _time.getHour;
  origGetDow  = _time.getDow;
});

afterEach(() => {
  simulator.stop();
  _time.getHour = origGetHour;
  _time.getDow  = origGetDow;
  jest.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function setTime(hour, dowIndex = 1) { // Monday default
  _time.getHour = () => hour;
  _time.getDow  = () => dowIndex;
}

// ── Start / stop / state ──────────────────────────────────────────────────────

describe('start / stop / state', () => {
  it('start(1) returns { status: "running", speed: 1 }', () => {
    expect(simulator.start(1)).toEqual({ status: 'running', speed: 1 });
    expect(simulator.getState()).toMatchObject({ running: true, speed: 1 });
  });

  it('start(5) returns { status: "running", speed: 5 }', () => {
    expect(simulator.start(5)).toEqual({ status: 'running', speed: 5 });
  });

  it('start(10) returns { status: "running", speed: 10 }', () => {
    expect(simulator.start(10)).toEqual({ status: 'running', speed: 10 });
  });

  it('calling start() twice returns "already_running" on second call', () => {
    simulator.start(1);
    expect(simulator.start(1).status).toBe('already_running');
  });

  it('stop() returns { status: "stopped" } after start', () => {
    simulator.start(1);
    expect(simulator.stop()).toEqual({ status: 'stopped' });
    expect(simulator.getState().running).toBe(false);
  });

  it('stop() returns "already_stopped" when not running', () => {
    expect(simulator.stop().status).toBe('already_stopped');
  });

  it('getState() reflects running = false initially', () => {
    expect(simulator.getState().running).toBe(false);
  });
});

// ── Hourly weight distribution ────────────────────────────────────────────────

describe('HOURLY_WEIGHTS — realistic time distribution', () => {
  it('has 24 entries (one per hour)', () => {
    expect(HOURLY_WEIGHTS).toHaveLength(24);
  });

  it('dead-night hours 00–04 have 0 weight (gym closed)', () => {
    for (let h = 0; h <= 4; h++) {
      expect(HOURLY_WEIGHTS[h]).toBe(0.00);
    }
  });

  it('morning peak hours 07–09 have the maximum weight of 1.00', () => {
    expect(HOURLY_WEIGHTS[7]).toBe(1.00);
    expect(HOURLY_WEIGHTS[8]).toBe(1.00);
    expect(HOURLY_WEIGHTS[9]).toBe(1.00);
  });

  it('evening peak hours 17–20 have weight 0.90 — second peak', () => {
    for (let h = 17; h <= 20; h++) {
      expect(HOURLY_WEIGHTS[h]).toBe(0.90);
    }
  });

  it('afternoon hours 14–16 are the quietest non-zero slot', () => {
    expect(HOURLY_WEIGHTS[14]).toBe(0.20);
    expect(HOURLY_WEIGHTS[15]).toBe(0.20);
    expect(HOURLY_WEIGHTS[16]).toBe(0.20);
  });

  it('hour 23 has 0 weight (gym closed)', () => {
    expect(HOURLY_WEIGHTS[23]).toBe(0.00);
  });

  it('evening peak weight (0.90) is strictly less than morning peak (1.00)', () => {
    expect(HOURLY_WEIGHTS[18]).toBeLessThan(HOURLY_WEIGHTS[8]);
  });
});

// ── Day-of-week weights ───────────────────────────────────────────────────────

describe('DOW_WEIGHTS — realistic day distribution', () => {
  it('has 7 entries (Sun=0 … Sat=6)', () => {
    expect(DOW_WEIGHTS).toHaveLength(7);
  });

  it('Monday (index 1) is the busiest day at 1.00×', () => {
    expect(DOW_WEIGHTS[1]).toBe(1.00);
  });

  it('Sunday (index 0) is the quietest day at 0.45×', () => {
    expect(DOW_WEIGHTS[0]).toBe(0.45);
  });

  it('Saturday (index 6) is less busy than Monday', () => {
    expect(DOW_WEIGHTS[6]).toBe(0.70);
    expect(DOW_WEIGHTS[6]).toBeLessThan(DOW_WEIGHTS[1]);
  });

  it('all weights are in [0, 1]', () => {
    DOW_WEIGHTS.forEach((w) => {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    });
  });
});

// ── tick() behaviour ──────────────────────────────────────────────────────────

describe('tick() — event generation', () => {
  it('does nothing when the hour weight is 0 (closed hours — 3am)', async () => {
    setTime(3); // HOURLY_WEIGHTS[3] = 0.00

    await simulator.tick();

    expect(pool.query).not.toHaveBeenCalled();
  });

  it('calls pool.query during morning peak (8am, Monday)', async () => {
    setTime(8, 1); // HOURLY_WEIGHTS[8] = 1.00, DOW_WEIGHTS[1] = 1.00

    // Mock simulateCheckin query chain:
    // getRandomActiveGym → gym
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Test', capacity: 300 }] })
      // getGymOccupancy (live occupancy check)
      .mockResolvedValueOnce({ rows: [{ cnt: 50 }] })
      // getRandomActiveMember
      .mockResolvedValueOnce({ rows: [{ id: 'm1', name: 'Rahul', plan_type: 'monthly' }] })
      // check existing open check-in
      .mockResolvedValueOnce({ rows: [] })
      // INSERT checkin
      .mockResolvedValueOnce({ rows: [] })
      // UPDATE member last_checkin_at
      .mockResolvedValueOnce({ rows: [] });

    // Force checkin branch: rand = 0.05 < (1.0 * 1.0 * 0.50 = 0.50) → simulateCheckin
    jest.spyOn(Math, 'random').mockReturnValue(0.05);

    await simulator.tick();

    expect(pool.query).toHaveBeenCalled();
  });

  it('calls pool.query during evening peak (6pm)', async () => {
    setTime(18, 1); // HOURLY_WEIGHTS[18] = 0.90, DOW_WEIGHTS[1] = 1.00

    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Test', capacity: 300 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 50 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'm1', name: 'Rahul', plan_type: 'monthly' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    jest.spyOn(Math, 'random').mockReturnValue(0.05);

    await simulator.tick();

    expect(pool.query).toHaveBeenCalled();
  });
});

// ── reset() ───────────────────────────────────────────────────────────────────

describe('reset()', () => {
  it('closes all open check-ins and returns { status: "reset" }', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE checkins

    const result = await simulator.reset();

    expect(result).toEqual({ status: 'reset' });
    const calls = pool.query.mock.calls;
    const updateCall = calls.find((c) => c[0].includes('WHERE checked_out IS NULL'));
    expect(updateCall).toBeDefined();
  });

  it('stops the simulator before resetting', async () => {
    simulator.start(1);
    pool.query.mockResolvedValueOnce({ rows: [] });

    await simulator.reset();

    expect(simulator.getState().running).toBe(false);
  });
});

// ── _time default implementations ────────────────────────────────────────────

describe('_time defaults', () => {
  it('_time.getHour() returns a number in [0, 23]', () => {
    // This covers the default arrow function bodies (lines 48–49)
    const hour = simulator._time.getHour();
    expect(typeof hour).toBe('number');
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });

  it('_time.getDow() returns a number in [0, 6]', () => {
    const dow = simulator._time.getDow();
    expect(typeof dow).toBe('number');
    expect(dow).toBeGreaterThanOrEqual(0);
    expect(dow).toBeLessThanOrEqual(6);
  });
});

// ── simulateCheckout ──────────────────────────────────────────────────────────

describe('simulateCheckout()', () => {
  it('closes an open check-in and broadcasts CHECKOUT_EVENT', async () => {
    pool.query
      // SELECT open check-in
      .mockResolvedValueOnce({
        rows: [{ id: 'ci1', member_id: 'm1', gym_id: 'g1', member_name: 'Priya', capacity: 200 }],
      })
      // UPDATE checked_out
      .mockResolvedValueOnce({ rows: [] })
      // getGymOccupancy (after checkout)
      .mockResolvedValueOnce({ rows: [{ cnt: 49 }] });

    await simulator.simulateCheckout();

    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(broadcast.broadcastCheckout).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        gym_id:      'g1',
        member_name: 'Priya',
      })
    );
  });

  it('does nothing when no open check-ins exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // no open CIs

    await simulator.simulateCheckout();

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastCheckout).not.toHaveBeenCalled();
  });
});

// ── simulatePayment ───────────────────────────────────────────────────────────

describe('simulatePayment()', () => {
  it('inserts a renewal payment and broadcasts PAYMENT_EVENT', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Test Gym', capacity: 200 }] }) // gym
      .mockResolvedValueOnce({ rows: [{ id: 'm1', name: 'Ankit', plan_type: 'monthly' }] }) // member
      .mockResolvedValueOnce({ rows: [] })           // INSERT payment
      .mockResolvedValueOnce({ rows: [{ total: 45000 }] }); // revenue total

    await simulator.simulatePayment();

    expect(pool.query).toHaveBeenCalledTimes(4);
    expect(broadcast.broadcastPayment).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        gym_id:    'g1',
        amount:    1499,  // monthly plan amount
        plan_type: 'monthly',
      })
    );
  });

  it('does nothing when no active gym found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // no gym

    await simulator.simulatePayment();

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastPayment).not.toHaveBeenCalled();
  });

  it('does nothing when no active member found for the gym', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Test', capacity: 200 }] }) // gym
      .mockResolvedValueOnce({ rows: [] }); // no member

    await simulator.simulatePayment();

    expect(broadcast.broadcastPayment).not.toHaveBeenCalled();
  });
});

// ── tick() — checkout and payment branches ────────────────────────────────────

describe('tick() — checkout and payment branches', () => {
  it('takes the checkout branch when rand is in (0.50, 0.70] activity range', async () => {
    setTime(8, 1); // activity = 1.00 * 1.00 = 1.00

    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'ci1', member_id: 'm1', gym_id: 'g1', member_name: 'Rahul', capacity: 200 }] })
      .mockResolvedValueOnce({ rows: [] })   // UPDATE
      .mockResolvedValueOnce({ rows: [{ cnt: 49 }] }); // occupancy

    // rand = 0.60 → > activity*0.50=0.50, < activity*0.70=0.70 → checkout
    jest.spyOn(Math, 'random').mockReturnValue(0.60);

    await simulator.tick();

    expect(broadcast.broadcastCheckout).toHaveBeenCalledTimes(1);
  });

  it('takes the payment branch when rand is in (0.70, 0.75] activity range', async () => {
    setTime(8, 1); // activity = 1.00

    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Test', capacity: 200 }] }) // gym
      .mockResolvedValueOnce({ rows: [{ id: 'm1', name: 'Rahul', plan_type: 'monthly' }] }) // member
      .mockResolvedValueOnce({ rows: [] })           // INSERT payment
      .mockResolvedValueOnce({ rows: [{ total: 1499 }] }); // revenue

    // rand = 0.72 → > 0.70, < 0.75 → payment
    jest.spyOn(Math, 'random').mockReturnValue(0.72);

    await simulator.tick();

    expect(broadcast.broadcastPayment).toHaveBeenCalledTimes(1);
  });

  it('takes no action when rand exceeds all activity thresholds (quiet tick)', async () => {
    setTime(8, 1); // activity = 1.00

    // rand = 0.99 → > 0.75 → quiet tick, no DB calls
    jest.spyOn(Math, 'random').mockReturnValue(0.99);

    await simulator.tick();

    expect(pool.query).not.toHaveBeenCalled();
  });
});
