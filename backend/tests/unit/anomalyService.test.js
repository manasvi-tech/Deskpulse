/**
 * Unit Tests — Anomaly Service
 *
 * Mocks pg Pool and WebSocket broadcast so no real DB or network is needed.
 * Uses _time injection to control operating-hours checks in a timezone-safe way
 * (avoids jest.useFakeTimers timezone pitfalls).
 */

// Hoist mocks before any require.
// pool.js exports a pg.Pool *instance* — its .query() lives on Pool.prototype,
// not as an own property, so Jest's auto-mock would leave it un-mocked.
// We use a factory that returns a plain object with jest.fn() methods instead.
jest.mock('../../src/db/pool', () => ({
  query: jest.fn(),
  on:    jest.fn(), // pool.on('error', ...) called at module load
}));
jest.mock('../../src/websocket/broadcast');

const pool = require('../../src/db/pool');
const broadcast = require('../../src/websocket/broadcast');

const {
  detectZeroCheckins,
  detectCapacityBreach,
  detectRevenueDrop,
  detectAllAnomalies,
  _time,
} = require('../../src/services/anomalyService');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Queue mock return values for successive pool.query calls. */
function queueQueries(...results) {
  results.forEach((r) => pool.query.mockResolvedValueOnce(r));
}

const GYM_OPEN = { id: 'g1', name: 'Test Gym', opens_at: '06:00', closes_at: '22:00' };

// ── Setup ─────────────────────────────────────────────────────────────────────

let originalGetNowMinutes;

beforeEach(() => {
  jest.clearAllMocks();
  broadcast.broadcastAnomalyDetected.mockImplementation(() => {});
  broadcast.broadcastAnomalyResolved.mockImplementation(() => {});
  // Save real implementation
  originalGetNowMinutes = _time.getNowMinutes;
});

afterEach(() => {
  // Restore time helper after each test
  _time.getNowMinutes = originalGetNowMinutes;
});

/** Set the mocked "current time" in minutes since midnight. */
function setCurrentTime(hours, minutes = 0) {
  _time.getNowMinutes = () => hours * 60 + minutes;
}

// ── zero_checkins ─────────────────────────────────────────────────────────────

describe('detectZeroCheckins', () => {
  it('fires a WARNING anomaly when an active gym has 0 check-ins in last 2h during operating hours', async () => {
    setCurrentTime(9); // 09:00 — inside 06:00–22:00

    queueQueries(
      { rows: [GYM_OPEN] },          // getAllGyms
      { rows: [{ cnt: 0 }] },        // no recent check-ins
      { rows: [] },                   // no existing anomaly
      { rows: [{ id: 'a1' }] }        // INSERT anomaly
    );

    await detectZeroCheckins();

    expect(broadcast.broadcastAnomalyDetected).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastAnomalyDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        anomaly_type: 'zero_checkins',
        severity:     'warning',
        gym_id:       'g1',
      })
    );
  });

  it('does NOT fire outside operating hours (3 AM)', async () => {
    setCurrentTime(3); // 03:00 — outside 06:00–22:00

    queueQueries(
      { rows: [GYM_OPEN] } // getAllGyms — time check skips this gym
    );

    await detectZeroCheckins();

    // Should never query for check-ins or create an anomaly
    expect(broadcast.broadcastAnomalyDetected).not.toHaveBeenCalled();
    // Only the gym list query was made
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('does NOT create a duplicate anomaly if one already exists', async () => {
    setCurrentTime(9);

    queueQueries(
      { rows: [GYM_OPEN] },
      { rows: [{ cnt: 0 }] },          // no recent check-ins
      { rows: [{ id: 'existing-a' }] } // existing open anomaly → skip INSERT
    );

    await detectZeroCheckins();

    expect(broadcast.broadcastAnomalyDetected).not.toHaveBeenCalled();
  });

  it('auto-resolves when a check-in is recorded', async () => {
    setCurrentTime(9);

    queueQueries(
      { rows: [GYM_OPEN] },          // getAllGyms
      { rows: [{ cnt: 3 }] },        // has recent check-ins → resolve
      { rows: [{ id: 'a1' }] }       // UPDATE anomaly SET resolved
    );

    await detectZeroCheckins();

    expect(broadcast.broadcastAnomalyResolved).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastAnomalyResolved).toHaveBeenCalledWith(
      expect.objectContaining({ anomaly_id: 'a1', gym_id: 'g1' })
    );
    expect(broadcast.broadcastAnomalyDetected).not.toHaveBeenCalled();
  });

  it('does not fire at exactly opens_at time (boundary — should be inside)', async () => {
    setCurrentTime(6, 0); // 06:00 == opensMin, not < opensMin → should check

    queueQueries(
      { rows: [GYM_OPEN] },
      { rows: [{ cnt: 1 }] }, // has activity → resolve (no existing anomaly either)
      { rows: [] }            // no open anomaly to resolve
    );

    await detectZeroCheckins();
    // No detection, no resolution (cnt > 0, no existing anomaly)
    expect(broadcast.broadcastAnomalyDetected).not.toHaveBeenCalled();
  });
});

// ── capacity_breach ───────────────────────────────────────────────────────────

describe('detectCapacityBreach', () => {
  it('fires a CRITICAL anomaly when occupancy > 90% of capacity', async () => {
    queueQueries(
      { rows: [{ id: 'g1', name: 'Bandra', capacity: 300, occupancy: 285 }] }, // 95%
      { rows: [] },                   // no existing anomaly
      { rows: [{ id: 'a2' }] }        // INSERT
    );

    await detectCapacityBreach();

    expect(broadcast.broadcastAnomalyDetected).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastAnomalyDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        anomaly_type: 'capacity_breach',
        severity:     'critical',
      })
    );
  });

  it('does NOT fire at exactly 90% (boundary: must be strictly > 90%)', async () => {
    queueQueries(
      { rows: [{ id: 'g1', name: 'Test', capacity: 100, occupancy: 90 }] } // exactly 90%
    );

    await detectCapacityBreach();

    expect(broadcast.broadcastAnomalyDetected).not.toHaveBeenCalled();
  });

  it('does NOT create a duplicate when an open capacity_breach already exists', async () => {
    queueQueries(
      { rows: [{ id: 'g1', name: 'Test', capacity: 100, occupancy: 95 }] },
      { rows: [{ id: 'existing-a' }] } // existing open anomaly
    );

    await detectCapacityBreach();

    expect(broadcast.broadcastAnomalyDetected).not.toHaveBeenCalled();
  });

  it('auto-resolves when occupancy drops below 85%', async () => {
    queueQueries(
      { rows: [{ id: 'g1', name: 'Test', capacity: 100, occupancy: 80 }] }, // 80% < 85%
      { rows: [{ id: 'a2' }] }  // UPDATE SET resolved
    );

    await detectCapacityBreach();

    expect(broadcast.broadcastAnomalyResolved).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastAnomalyResolved).toHaveBeenCalledWith(
      expect.objectContaining({ anomaly_id: 'a2' })
    );
  });

  it('leaves an existing anomaly open when occupancy is in the 85–90% dead zone', async () => {
    queueQueries(
      { rows: [{ id: 'g1', name: 'Test', capacity: 100, occupancy: 87 }] }
    );

    await detectCapacityBreach();

    expect(broadcast.broadcastAnomalyDetected).not.toHaveBeenCalled();
    expect(broadcast.broadcastAnomalyResolved).not.toHaveBeenCalled();
  });
});

// ── revenue_drop ──────────────────────────────────────────────────────────────

describe('detectRevenueDrop', () => {
  it('fires a WARNING when today revenue is < 70% of same weekday last week', async () => {
    queueQueries(
      { rows: [{ id: 'g1', name: 'Salt Lake' }] },            // getAllGyms
      { rows: [{ today_rev: 1499, last_week_rev: 35991 }] }, // ~4% → below 70%
      { rows: [] },                                           // no existing anomaly
      { rows: [{ id: 'a3' }] }                                // INSERT
    );

    await detectRevenueDrop();

    expect(broadcast.broadcastAnomalyDetected).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastAnomalyDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        anomaly_type: 'revenue_drop',
        severity:     'warning',
      })
    );
  });

  it('does NOT fire when today revenue is exactly 70% of last week', async () => {
    queueQueries(
      { rows: [{ id: 'g1', name: 'Test Gym' }] },
      { rows: [{ today_rev: 7000, last_week_rev: 10000 }] } // exactly 70% — NOT < 70%
    );

    await detectRevenueDrop();

    expect(broadcast.broadcastAnomalyDetected).not.toHaveBeenCalled();
  });

  it('does NOT fire when today revenue is above 70% threshold', async () => {
    // ratio = 30000/35000 = 85.7% — above 70% AND above 80%.
    // The service skips detection but still runs the auto-resolve UPDATE (ratio >= 0.80).
    // That UPDATE returns no rows, so no ANOMALY_RESOLVED broadcast either.
    queueQueries(
      { rows: [{ id: 'g1', name: 'Test Gym' }] },
      { rows: [{ today_rev: 30000, last_week_rev: 35000 }] }, // 85.7%
      { rows: [] }  // auto-resolve UPDATE — no open revenue_drop anomaly to resolve
    );

    await detectRevenueDrop();

    expect(broadcast.broadcastAnomalyDetected).not.toHaveBeenCalled();
    expect(broadcast.broadcastAnomalyResolved).not.toHaveBeenCalled();
  });

  it('skips gyms with last_week_rev < ₹1000 (insufficient baseline)', async () => {
    queueQueries(
      { rows: [{ id: 'g1', name: 'New Gym' }] },
      { rows: [{ today_rev: 0, last_week_rev: 500 }] } // too small → skip
    );

    await detectRevenueDrop();

    expect(broadcast.broadcastAnomalyDetected).not.toHaveBeenCalled();
  });

  it('auto-resolves when revenue recovers to ≥ 80% of last week', async () => {
    queueQueries(
      { rows: [{ id: 'g1', name: 'Test Gym' }] },
      { rows: [{ today_rev: 30000, last_week_rev: 35000 }] }, // 85.7% ≥ 80%
      { rows: [{ id: 'a3' }] }                                  // UPDATE resolved
    );

    await detectRevenueDrop();

    expect(broadcast.broadcastAnomalyResolved).toHaveBeenCalledTimes(1);
    expect(broadcast.broadcastAnomalyResolved).toHaveBeenCalledWith(
      expect.objectContaining({ anomaly_id: 'a3' })
    );
  });
});

// ── detectAllAnomalies ────────────────────────────────────────────────────────

describe('detectAllAnomalies', () => {
  it('runs all three detectors without throwing', async () => {
    // Set to 3am so zero_checkins skips the gym time check
    setCurrentTime(3);
    pool.query.mockResolvedValue({ rows: [] });

    await expect(detectAllAnomalies()).resolves.toBeUndefined();
  });

  it('does not propagate errors — swallows them internally', async () => {
    pool.query.mockRejectedValue(new Error('DB connection lost'));

    await expect(detectAllAnomalies()).resolves.toBeUndefined();
  });
});

// ── _parseTimeToMinutes helper ────────────────────────────────────────────────

describe('_parseTimeToMinutes', () => {
  const { _parseTimeToMinutes } = require('../../src/services/anomalyService');

  it('parses HH:MM correctly', () => {
    expect(_parseTimeToMinutes('06:00')).toBe(360);
    expect(_parseTimeToMinutes('22:30')).toBe(1350);
    expect(_parseTimeToMinutes('05:30')).toBe(330);
  });

  it('parses HH:MM:SS correctly (ignores seconds)', () => {
    expect(_parseTimeToMinutes('06:00:00')).toBe(360);
  });
});
