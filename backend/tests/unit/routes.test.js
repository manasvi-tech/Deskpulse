/**
 * Unit Tests — Route Handlers
 *
 * Tests route handler logic by mocking statsService and simulatorService.
 * No real DB or WebSocket server needed.
 *
 * Covers: gyms.js, anomalies.js, analytics.js, simulator.js (routes)
 */

// Mock everything that touches the DB or external state
jest.mock('../../src/db/pool',                  () => ({ query: jest.fn(), on: jest.fn() }));
jest.mock('../../src/services/statsService');
jest.mock('../../src/services/simulatorService');
jest.mock('../../src/websocket/server',         () => ({ initWebSocket: jest.fn(), getWSS: jest.fn().mockReturnValue(null) }));

const request   = require('supertest');
const stats     = require('../../src/services/statsService');
const simulator = require('../../src/services/simulatorService');
const { app }   = require('../../src/app');

// Keep simulator.getState() returning a sensible default
simulator.getState.mockReturnValue({ running: false, speed: 1 });

const GYMS = [
  { id: 'g1', name: 'WTF Gyms — Bandra', city: 'Mumbai', capacity: 300, status: 'active', occupancy: 50, occupancy_pct: 16.7, today_revenue: 15000 },
  { id: 'g2', name: 'WTF Gyms — Powai',  city: 'Mumbai', capacity: 250, status: 'active', occupancy: 40, occupancy_pct: 16.0, today_revenue: 12000 },
];

const GYM_LIVE = {
  id: 'g1', name: 'WTF Gyms — Bandra', city: 'Mumbai', capacity: 300,
  status: 'active', opens_at: '05:00', closes_at: '23:00',
  occupancy: 50, occupancy_pct: 16.7, today_revenue: 15000, recent_activity: [],
};

const ANOMALY = {
  id: 'a1', gym_id: 'g1', gym_name: 'WTF Bandra',
  type: 'zero_checkins', severity: 'warning', message: 'No check-ins',
  resolved: false, dismissed: false, detected_at: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  simulator.getState.mockReturnValue({ running: false, speed: 1 });
});

// ── GET /api/gyms ─────────────────────────────────────────────────────────────

describe('GET /api/gyms', () => {
  it('returns 200 with gyms array from statsService', async () => {
    stats.getAllGymsWithStats.mockResolvedValue(GYMS);

    const res = await request(app).get('/api/gyms');

    expect(res.status).toBe(200);
    expect(res.body.gyms).toHaveLength(2);
    expect(stats.getAllGymsWithStats).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when statsService throws', async () => {
    stats.getAllGymsWithStats.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/gyms');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ── GET /api/gyms/:id/live ────────────────────────────────────────────────────

describe('GET /api/gyms/:id/live', () => {
  it('returns 200 with live gym data when found', async () => {
    stats.getGymLive.mockResolvedValue(GYM_LIVE);

    const res = await request(app).get('/api/gyms/g1/live');

    expect(res.status).toBe(200);
    expect(res.body.gym).toHaveProperty('id', 'g1');
    expect(res.body.gym).toHaveProperty('occupancy');
    expect(res.body.gym).toHaveProperty('today_revenue');
    expect(res.body.gym).toHaveProperty('recent_activity');
  });

  it('returns 404 when gym not found (service returns null)', async () => {
    stats.getGymLive.mockResolvedValue(null);

    const res = await request(app).get('/api/gyms/00000000-0000-0000-0000-000000000000/live');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 500 when statsService throws', async () => {
    stats.getGymLive.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/gyms/g1/live');

    expect(res.status).toBe(500);
  });
});

// ── GET /api/gyms/:id/analytics ───────────────────────────────────────────────

describe('GET /api/gyms/:id/analytics', () => {
  const ANALYTICS = {
    gym: { id: 'g1', name: 'WTF Bandra', capacity: 300 },
    heatmap: [], revenue_chart: [], churn_risk: [],
    member_stats: { total_members: 300, active_members: 270, inactive_members: 20, frozen_members: 10,
                    monthly_count: 150, quarterly_count: 120, annual_count: 30,
                    monthly_pct: 50, quarterly_pct: 40, annual_pct: 10 },
  };

  it('returns 400 for an invalid dateRange (no DB needed)', async () => {
    const res = await request(app).get('/api/gyms/g1/analytics?dateRange=60d');
    expect(res.status).toBe(400);
    expect(stats.getGymAnalytics).not.toHaveBeenCalled();
  });

  it('returns 200 with analytics data for valid dateRange', async () => {
    stats.getGymAnalytics.mockResolvedValue(ANALYTICS);

    const res = await request(app).get('/api/gyms/g1/analytics?dateRange=30d');

    expect(res.status).toBe(200);
    expect(res.body.analytics).toHaveProperty('heatmap');
    expect(res.body.analytics).toHaveProperty('churn_risk');
  });

  it('returns 404 when gym not found', async () => {
    stats.getGymAnalytics.mockResolvedValue(null);

    const res = await request(app).get('/api/gyms/00000000-0000-0000-0000-000000000000/analytics');

    expect(res.status).toBe(404);
  });

  it('returns 500 when service throws', async () => {
    stats.getGymAnalytics.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/gyms/g1/analytics?dateRange=7d');

    expect(res.status).toBe(500);
  });
});

// ── GET /api/anomalies ────────────────────────────────────────────────────────

describe('GET /api/anomalies', () => {
  it('returns 200 with empty array when no anomalies', async () => {
    stats.getActiveAnomalies.mockResolvedValue([]);

    const res = await request(app).get('/api/anomalies');

    expect(res.status).toBe(200);
    expect(res.body.anomalies).toEqual([]);
  });

  it('returns 200 with anomalies list', async () => {
    stats.getActiveAnomalies.mockResolvedValue([ANOMALY]);

    const res = await request(app).get('/api/anomalies');

    expect(res.status).toBe(200);
    expect(res.body.anomalies).toHaveLength(1);
  });

  it('returns 400 for invalid severity param', async () => {
    const res = await request(app).get('/api/anomalies?severity=urgent');
    expect(res.status).toBe(400);
    expect(stats.getActiveAnomalies).not.toHaveBeenCalled();
  });

  it('filters by severity=warning', async () => {
    stats.getActiveAnomalies.mockResolvedValue([ANOMALY]);

    const res = await request(app).get('/api/anomalies?severity=warning');

    expect(res.status).toBe(200);
    expect(stats.getActiveAnomalies).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warning' })
    );
  });

  it('returns 500 when service throws', async () => {
    stats.getActiveAnomalies.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/anomalies');

    expect(res.status).toBe(500);
  });
});

// ── PATCH /api/anomalies/:id/dismiss ─────────────────────────────────────────

describe('PATCH /api/anomalies/:id/dismiss', () => {
  it('returns 403 when anomaly is CRITICAL', async () => {
    stats.dismissAnomaly.mockResolvedValue({ error: 'forbidden' });

    const res = await request(app).patch('/api/anomalies/a1/dismiss');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/critical/i);
  });

  it('returns 404 when anomaly does not exist', async () => {
    stats.dismissAnomaly.mockResolvedValue({ error: 'not_found' });

    const res = await request(app).patch('/api/anomalies/nonexistent/dismiss');

    expect(res.status).toBe(404);
  });

  it('returns 400 when anomaly is already resolved', async () => {
    stats.dismissAnomaly.mockResolvedValue({ error: 'already_resolved' });

    const res = await request(app).patch('/api/anomalies/a1/dismiss');

    expect(res.status).toBe(400);
  });

  it('returns 200 with dismissed anomaly on success', async () => {
    stats.dismissAnomaly.mockResolvedValue({
      anomaly: { ...ANOMALY, dismissed: true },
    });

    const res = await request(app).patch('/api/anomalies/a1/dismiss');

    expect(res.status).toBe(200);
    expect(res.body.anomaly.dismissed).toBe(true);
  });

  it('returns 500 when service throws', async () => {
    stats.dismissAnomaly.mockRejectedValue(new Error('DB error'));

    const res = await request(app).patch('/api/anomalies/a1/dismiss');

    expect(res.status).toBe(500);
  });
});

// ── GET /api/analytics/cross-gym ─────────────────────────────────────────────

describe('GET /api/analytics/cross-gym', () => {
  const CROSS_GYM = [
    { gym_id: 'g1', gym_name: 'Bandra', city: 'Mumbai', total_revenue: 50000, payment_count: 35 },
    { gym_id: 'g2', gym_name: 'Powai',  city: 'Mumbai', total_revenue: 40000, payment_count: 28 },
  ];

  it('returns 200 with sorted cross-gym revenue data', async () => {
    stats.getCrossGymRevenue.mockResolvedValue(CROSS_GYM);

    const res = await request(app).get('/api/analytics/cross-gym');

    expect(res.status).toBe(200);
    expect(res.body.gyms).toHaveLength(2);
    expect(res.body.gyms[0]).toHaveProperty('gym_id');
    expect(res.body.gyms[0]).toHaveProperty('total_revenue');
  });

  it('returns 500 when service throws', async () => {
    stats.getCrossGymRevenue.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/analytics/cross-gym');

    expect(res.status).toBe(500);
  });
});

// ── Simulator routes ──────────────────────────────────────────────────────────

describe('POST /api/simulator/start (route unit)', () => {
  afterEach(async () => {
    // Clean up any running interval from the simulator service
    await request(app).post('/api/simulator/stop');
  });

  it('returns { status: "running" } for valid speed 1', async () => {
    simulator.start.mockReturnValue({ status: 'running', speed: 1 });

    const res = await request(app).post('/api/simulator/start').send({ speed: 1 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('running');
  });

  it('returns 400 for invalid speed 7', async () => {
    const res = await request(app).post('/api/simulator/start').send({ speed: 7 });
    expect(res.status).toBe(400);
    expect(simulator.start).not.toHaveBeenCalled();
  });
});

describe('POST /api/simulator/reset', () => {
  it('returns result from simulator.reset()', async () => {
    simulator.reset.mockResolvedValue({ status: 'reset' });

    const res = await request(app).post('/api/simulator/reset');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('reset');
  });
});
