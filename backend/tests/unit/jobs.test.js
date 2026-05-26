/**
 * Unit Tests — Background Jobs
 *
 * Tests anomalyDetector.js (startAnomalyDetector / stopAnomalyDetector /
 * scheduleMVRefresh) and the thin jobs/simulator.js re-export.
 *
 * node-cron, pool, and anomalyService are mocked so no DB or real timers run.
 */

jest.mock('../../src/db/pool', () => ({ query: jest.fn(), on: jest.fn() }));
jest.mock('../../src/services/anomalyService');
jest.mock('node-cron');

const cron           = require('node-cron');
const anomalyService = require('../../src/services/anomalyService');
const pool           = require('../../src/db/pool');

// We need a fresh copy of the module per describe block because the module
// holds module-level mutable state (detectorTask, mvTask).
// Use jest.isolateModules to get a fresh require per test group.

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return a mock cron task */
function makeTask() {
  return { stop: jest.fn(), start: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  anomalyService.detectAllAnomalies.mockResolvedValue(undefined);
});

// ── startAnomalyDetector ──────────────────────────────────────────────────────

describe('startAnomalyDetector', () => {
  let detector;

  beforeEach(() => {
    jest.isolateModules(() => {
      detector = require('../../src/jobs/anomalyDetector');
    });
  });

  it('schedules a cron job with the 30-second pattern', () => {
    const task = makeTask();
    cron.schedule.mockReturnValue(task);

    detector.startAnomalyDetector();

    expect(cron.schedule).toHaveBeenCalledWith(
      '*/30 * * * * *',
      expect.any(Function)
    );
  });

  it('calls detectAllAnomalies immediately on start', async () => {
    cron.schedule.mockReturnValue(makeTask());

    detector.startAnomalyDetector();
    // micro-flush so the immediate .catch() handler resolves
    await Promise.resolve();

    expect(anomalyService.detectAllAnomalies).toHaveBeenCalled();
  });

  it('stops the previous task when called twice', () => {
    const task1 = makeTask();
    const task2 = makeTask();
    cron.schedule.mockReturnValueOnce(task1).mockReturnValueOnce(task2);

    detector.startAnomalyDetector();
    detector.startAnomalyDetector();

    expect(task1.stop).toHaveBeenCalled();
  });
});

// ── stopAnomalyDetector ───────────────────────────────────────────────────────

describe('stopAnomalyDetector', () => {
  let detector;

  beforeEach(() => {
    jest.isolateModules(() => {
      detector = require('../../src/jobs/anomalyDetector');
    });
  });

  it('stops the running cron task', () => {
    const task = makeTask();
    cron.schedule.mockReturnValue(task);

    detector.startAnomalyDetector();
    detector.stopAnomalyDetector();

    expect(task.stop).toHaveBeenCalled();
  });

  it('does not throw when called before start', () => {
    expect(() => detector.stopAnomalyDetector()).not.toThrow();
  });
});

// ── scheduleMVRefresh ─────────────────────────────────────────────────────────

describe('scheduleMVRefresh', () => {
  let detector;

  beforeEach(() => {
    jest.isolateModules(() => {
      detector = require('../../src/jobs/anomalyDetector');
    });
  });

  it('schedules a cron job with the 15-minute pattern', () => {
    cron.schedule.mockReturnValue(makeTask());

    detector.scheduleMVRefresh();

    expect(cron.schedule).toHaveBeenCalledWith(
      '*/15 * * * *',
      expect.any(Function)
    );
  });

  it('stops an existing mv task before scheduling a new one', () => {
    const task1 = makeTask();
    const task2 = makeTask();
    cron.schedule.mockReturnValueOnce(task1).mockReturnValueOnce(task2);

    detector.scheduleMVRefresh();
    detector.scheduleMVRefresh();

    expect(task1.stop).toHaveBeenCalled();
  });

  it('the scheduled callback calls pool.query for REFRESH MATERIALIZED VIEW', async () => {
    let cronCallback;
    cron.schedule.mockImplementation((pattern, cb) => {
      cronCallback = cb;
      return makeTask();
    });
    pool.query.mockResolvedValue({ rows: [] });

    detector.scheduleMVRefresh();

    // Manually invoke the cron callback to simulate a tick
    await cronCallback();

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('REFRESH MATERIALIZED VIEW')
    );
  });
});

// ── jobs/simulator.js (re-export) ─────────────────────────────────────────────

describe('jobs/simulator.js re-export', () => {
  it('re-exports scheduleMVRefresh from anomalyDetector', () => {
    let simJobs;
    jest.isolateModules(() => {
      simJobs = require('../../src/jobs/simulator');
    });
    expect(typeof simJobs.scheduleMVRefresh).toBe('function');
  });
});
