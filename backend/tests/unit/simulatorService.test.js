/**
 * Unit Tests — Simulator Service
 *
 * Verifies:
 *   • Start / stop / state transitions
 *   • Speed multiplier returns correct status
 *   • Hourly weight distribution matches current service implementation
 *   • Day-of-week weights match current service implementation
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

  it('dead-night hours 00–07 have 0 weight (location closed)', () => {
    for (let h = 0; h <= 7; h++) {
      expect(HOURLY_WEIGHTS[h]).toBe(0.00);
    }
  });

  it('morning peak hours 09–11 have the maximum weight of 1.00', () => {
    expect(HOURLY_WEIGHTS[9]).toBe(1.00);
    expect(HOURLY_WEIGHTS[10]).toBe(1.00);
    expect(HOURLY_WEIGHTS[11]).toBe(1.00);
  });

  it('hour 08 is the early-arrival slot with weight 0.40', () => {
    expect(HOURLY_WEIGHTS[8]).toBe(0.40);
  });

  it('afternoon hours 14–17 have the second-peak weight of 0.90', () => {
    for (let h = 14; h <= 17; h++) {
      expect(HOURLY_WEIGHTS[h]).toBe(0.90);
    }
  });

  it('hour 23 has 0 weight (location closed)', () => {
    expect(HOURLY_WEIGHTS[23]).toBe(0.00);
  });

  it('afternoon peak weight (0.90) is strictly less than morning peak (1.00)', () => {
    expect(HOURLY_WEIGHTS[14]).toBeLessThan(HOURLY_WEIGHTS[9]);
  });
});

// ── Day-of-week weights ───────────────────────────────────────────────────────

describe('DOW_WEIGHTS — realistic day distribution', () => {
  it('has 7 entries (Sun=0 … Sat=6)', () => {
    expect(DOW_WEIGHTS).toHaveLength(7);
  });

  it('Wednesday (index 3) is the busiest day at 1.00×', () => {
    expect(DOW_WEIGHTS[3]).toBe(1.00);
  });

  it('Sunday (index 0) is the quietest day at 0.20×', () => {
    expect(DOW_WEIGHTS[0]).toBe(0.20);
  });

  it('Saturday (index 6) is less busy than Wednesday', () => {
    expect(DOW_WEIGHTS[6]).toBe(0.40);
    expect(DOW_WEIGHTS[6]).toBeLessThan(DOW_WEIGHTS[3]);
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

  it('calls pool.query during morning peak (9am, Wednesday)', async () => {
    setTime(9, 3); // HOURLY_WEIGHTS[9] = 1.00, DOW_WEIGHTS[3] = 1.00
    // probability = 1.00 * 1.00 * 0.30 = 0.30

    // Mock simulateCheckin query chain:
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Test', capacity: 300 }] })
      // getLocationOccupancy
      .mockResolvedValueOnce({ rows: [{ cnt: 50 }] })
      // getRandomActiveMember
      .mockResolvedValueOnce({ rows: [{ id: 'm1', name: 'Rahul' }] })
      // check existing open check-in
      .mockResolvedValueOnce({ rows: [] })
      // INSERT checkin
      .mockResolvedValueOnce({ rows: [] });

    // roll=0.05 < 0.30 → proceed; r=0.05 < 0.55 → simulateCheckin
    jest.spyOn(Math, 'random').mockReturnValue(0.05);

    await simulator.tick();

    expect(pool.query).toHaveBeenCalled();
  });

  it('calls pool.query during afternoon peak (2pm)', async () => {
    setTime(14, 3); // HOURLY_WEIGHTS[14] = 0.90, DOW_WEIGHTS[3] = 1.00
    // probability = 0.90 * 1.00 * 0.30 = 0.27

    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Test', capacity: 300 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 50 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'm1', name: 'Rahul' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    // roll=0.05 < 0.27 → proceed; r=0.05 < 0.55 → simulateCheckin
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
      // SELECT open check-in — includes location_id from the JOIN
      .mockResolvedValueOnce({
        rows: [{ id: 'ci1', member_id: 'm1', location_id: 'g1', member_name: 'Priya', capacity: 200 }],
      })
      // UPDATE checked_out
      .mockResolvedValueOnce({ rows: [] })
      // getLocationOccupancy (after checkout)
      .mockResolvedValueOnce({ rows: [{ cnt: 49 }] });

    await simulator.simulateCheckout();

    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(broadcast.broadcastCheckout).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        location_id: 'g1',
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
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Test Gym', capacity: 200 }] }) // location
      .mockResolvedValueOnce({ rows: [{ id: 'm1', name: 'Ankit', membership_id: 'ms1', plan_type: 'hot_desk' }] }) // member
      .mockResolvedValueOnce({ rows: [] })           // INSERT payment
      .mockResolvedValueOnce({ rows: [{ total: 45000 }] }); // revenue total

    await simulator.simulatePayment();

    expect(pool.query).toHaveBeenCalledTimes(4);
    expect(broadcast.broadcastPayment).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        location_id: 'g1',
        amount:      3999,  // hot_desk plan amount
        plan_type:   'hot_desk',
      })
    );
  });

  it('does nothing when no active location found', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // no location

    await simulator.simulatePayment();

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastPayment).not.toHaveBeenCalled();
  });

  it('does nothing when no active member found for the location', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Test', capacity: 200 }] }) // location
      .mockResolvedValueOnce({ rows: [] }); // no member

    await simulator.simulatePayment();

    expect(broadcast.broadcastPayment).not.toHaveBeenCalled();
  });
});

// ── tick() — checkout and payment branches ────────────────────────────────────

describe('tick() — checkout and payment branches', () => {
  it('takes the checkout branch when second random is in [0.55, 0.85)', async () => {
    setTime(9, 3); // HOURLY_WEIGHTS[9]=1.00, DOW_WEIGHTS[3]=1.00, sf=0.30 → probability=0.30

    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'ci1', member_id: 'm1', location_id: 'g1', member_name: 'Rahul', capacity: 200 }] })
      .mockResolvedValueOnce({ rows: [] })   // UPDATE
      .mockResolvedValueOnce({ rows: [{ cnt: 49 }] }); // occupancy

    // roll=0.05 < 0.30 → proceed; r=0.60 in [0.55, 0.85) → checkout
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.05)
      .mockReturnValueOnce(0.60);

    await simulator.tick();

    expect(broadcast.broadcastCheckout).toHaveBeenCalledTimes(1);
  });

  it('takes the payment branch when second random is >= 0.85', async () => {
    setTime(9, 3); // probability = 0.30

    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'g1', name: 'Test', capacity: 200 }] }) // location
      .mockResolvedValueOnce({ rows: [{ id: 'm1', name: 'Rahul', membership_id: 'ms1', plan_type: 'hot_desk' }] }) // member
      .mockResolvedValueOnce({ rows: [] })           // INSERT payment
      .mockResolvedValueOnce({ rows: [{ total: 3999 }] }); // revenue

    // roll=0.05 < 0.30 → proceed; r=0.90 >= 0.85 → payment
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.05)
      .mockReturnValueOnce(0.90);

    await simulator.tick();

    expect(broadcast.broadcastPayment).toHaveBeenCalledTimes(1);
  });

  it('takes no action when roll exceeds activity threshold (quiet tick)', async () => {
    setTime(9, 3); // probability = 0.30

    // roll=0.99 >= 0.30 → return early, no DB calls
    jest.spyOn(Math, 'random').mockReturnValue(0.99);

    await simulator.tick();

    expect(pool.query).not.toHaveBeenCalled();
  });
});
