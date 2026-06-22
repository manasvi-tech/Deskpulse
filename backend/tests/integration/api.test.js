/**
 * Integration Tests — REST API
 *
 * Uses Supertest against the Express app.
 * Tests that require a real database are gated on DATABASE_URL.
 * Validation-only tests (400/404 path guards) always run.
 *
 * How reviewers run: cd backend && npm test
 */

// Mock authMiddleware so tests are not blocked by 401 responses.
jest.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: (req, res, next) => {
    req.user = {
      id: 'test-user-id',
      email: 'admin@deskpulse.io',
      role: 'super_admin',
      location_id: null,
      name: 'Test Admin',
      is_active: true,
    };
    next();
  },
  requireRole: () => (req, res, next) => next(),
  requireLocation: (req, res, next) => next(),
}));

const request   = require('supertest');
const pool      = require('../../src/db/pool');
const simulator = require('../../src/services/simulatorService');

// Prevent app.js from starting background jobs or listening during tests
// (require.main === module guard in app.js handles this)
const { app } = require('../../src/app');

// ── Global teardown — prevent Jest from hanging on open handles ───────────────
afterAll(async () => {
  simulator.stop();
  // pool.end() may reject if no DB was ever connected — swallow the error
  await pool.end().catch(() => {});
});

const HAS_DB = Boolean(process.env.DATABASE_URL);

// ── Helper ────────────────────────────────────────────────────────────────────

/** Skip a test if no DB is available (run in Docker). */
const itDb = HAS_DB ? it : it.skip;

// ── Health check ─────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 with status ok when DB is connected', async () => {
    if (!HAS_DB) {
      // Without DB, expect 503 — still tests the endpoint path
      const res = await request(app).get('/api/health');
      expect([200, 503]).toContain(res.status);
      return;
    }
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
  });
});

// ── GET /api/locations ────────────────────────────────────────────────────────

describe('GET /api/locations', () => {
  itDb('returns 200 with a locations array', async () => {
    const res = await request(app).get('/api/locations');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('locations');
    expect(Array.isArray(res.body.locations)).toBe(true);
  });

  itDb('returns exactly 10 locations after seeding', async () => {
    const res = await request(app).get('/api/locations');
    expect(res.status).toBe(200);
    expect(res.body.locations).toHaveLength(10);
  });

  itDb('each location has required fields: id, name, city, capacity, occupancy, today_revenue', async () => {
    const res = await request(app).get('/api/locations');
    const loc = res.body.locations[0];
    expect(loc).toHaveProperty('id');
    expect(loc).toHaveProperty('name');
    expect(loc).toHaveProperty('city');
    expect(loc).toHaveProperty('capacity');
    expect(loc).toHaveProperty('occupancy');
    expect(loc).toHaveProperty('today_revenue');
    expect(loc).toHaveProperty('occupancy_pct');
  });

  itDb('all returned locations have status "active"', async () => {
    const res = await request(app).get('/api/locations');
    res.body.locations.forEach((l) => {
      expect(l.status).toBe('active');
    });
  });
});

// ── GET /api/locations/:id/live ───────────────────────────────────────────────

describe('GET /api/locations/:id/live', () => {
  itDb('returns 200 with all required fields for a valid location', async () => {
    const locsRes   = await request(app).get('/api/locations');
    const locationId = locsRes.body.locations[0].id;

    const res = await request(app).get(`/api/locations/${locationId}/live`);
    expect(res.status).toBe(200);

    const loc = res.body.location;
    expect(loc).toHaveProperty('id', locationId);
    expect(loc).toHaveProperty('name');
    expect(loc).toHaveProperty('capacity');
    expect(loc).toHaveProperty('occupancy');
    expect(loc).toHaveProperty('occupancy_pct');
    expect(loc).toHaveProperty('today_revenue');
    expect(loc).toHaveProperty('recent_activity');
    expect(Array.isArray(loc.recent_activity)).toBe(true);
  });

  // 404 path requires a DB round-trip (getLocationLive returns null for unknown IDs)
  itDb('returns 404 for a non-existent location UUID', async () => {
    const res = await request(app).get('/api/locations/00000000-0000-0000-0000-000000000000/live');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// ── GET /api/locations/:id/analytics ─────────────────────────────────────────

describe('GET /api/locations/:id/analytics', () => {
  it('returns 400 for an invalid dateRange', async () => {
    const res = await request(app).get('/api/locations/some-id/analytics?dateRange=60d');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  itDb('returns 200 with heatmap, revenue_chart, churn_risk, member_stats', async () => {
    const locsRes   = await request(app).get('/api/locations');
    const locationId = locsRes.body.locations[0].id;

    const res = await request(app).get(`/api/locations/${locationId}/analytics?dateRange=30d`);
    expect(res.status).toBe(200);

    const a = res.body.analytics;
    expect(a).toHaveProperty('heatmap');
    expect(a).toHaveProperty('revenue_chart');
    expect(a).toHaveProperty('churn_risk');
    expect(a).toHaveProperty('member_stats');
    expect(Array.isArray(a.heatmap)).toBe(true);
  });

  // 404 path requires a DB round-trip (getLocationAnalytics returns null for unknown IDs)
  itDb('returns 404 for a non-existent location', async () => {
    const res = await request(app).get('/api/locations/00000000-0000-0000-0000-000000000000/analytics');
    expect(res.status).toBe(404);
  });
});

// ── GET /api/anomalies ────────────────────────────────────────────────────────

describe('GET /api/anomalies', () => {
  itDb('returns 200 with an anomalies array', async () => {
    const res = await request(app).get('/api/anomalies');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('anomalies');
    expect(Array.isArray(res.body.anomalies)).toBe(true);
  });

  it('returns 400 for an invalid severity query param', async () => {
    const res = await request(app).get('/api/anomalies?severity=urgent');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  itDb('accepts severity=warning and returns 200', async () => {
    const res = await request(app).get('/api/anomalies?severity=warning');
    expect(res.status).toBe(200);
    // All returned anomalies must have severity=warning
    res.body.anomalies.forEach((a) => {
      expect(a.severity).toBe('warning');
    });
  });

  itDb('accepts severity=critical and returns 200', async () => {
    const res = await request(app).get('/api/anomalies?severity=critical');
    expect(res.status).toBe(200);
  });
});

// ── PATCH /api/anomalies/:id/dismiss ─────────────────────────────────────────

describe('PATCH /api/anomalies/:id/dismiss', () => {
  // 404 path requires a DB round-trip (dismissAnomaly → getAnomalyById)
  itDb('returns 404 for a non-existent anomaly UUID', async () => {
    const res = await request(app)
      .patch('/api/anomalies/00000000-0000-0000-0000-000000000000/dismiss');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  itDb('returns 403 when trying to dismiss a CRITICAL anomaly', async () => {
    // Fetch existing anomalies and find a critical one (seeded as Scenario B)
    const anomaliesRes = await request(app).get('/api/anomalies?severity=critical');
    const criticals = anomaliesRes.body.anomalies;

    if (criticals.length === 0) {
      // No critical anomaly available in this test run — skip assertion
      console.warn('[test] No critical anomaly found; seed may not have run yet');
      return;
    }

    const res = await request(app).patch(`/api/anomalies/${criticals[0].id}/dismiss`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/critical/i);
  });

  itDb('returns 200 when successfully dismissing a WARNING anomaly', async () => {
    const anomaliesRes = await request(app).get('/api/anomalies?severity=warning');
    const warnings = anomaliesRes.body.anomalies;

    if (warnings.length === 0) {
      console.warn('[test] No warning anomaly found; seed may not have run yet');
      return;
    }

    const res = await request(app).patch(`/api/anomalies/${warnings[0].id}/dismiss`);
    expect([200, 400]).toContain(res.status); // 400 if already resolved
  });
});

// ── GET /api/analytics/cross-location ────────────────────────────────────────

describe('GET /api/analytics/cross-location', () => {
  itDb('returns 200 with a locations array of revenue data', async () => {
    const res = await request(app).get('/api/analytics/cross-location');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('locations');
    expect(Array.isArray(res.body.locations)).toBe(true);
  });

  itDb('returned locations have location_id, location_name, total_revenue', async () => {
    const res = await request(app).get('/api/analytics/cross-location');
    expect(res.status).toBe(200);
    res.body.locations.forEach((l) => {
      expect(l).toHaveProperty('location_id');
      expect(l).toHaveProperty('location_name');
      expect(l).toHaveProperty('total_revenue');
    });
  });

  itDb('returns 10 locations (one per seeded location)', async () => {
    const res = await request(app).get('/api/analytics/cross-location');
    expect(res.body.locations).toHaveLength(10);
  });
});

// ── Simulator endpoints ───────────────────────────────────────────────────────

describe('POST /api/simulator/start', () => {
  afterEach(async () => {
    // Clean up: stop simulator after each test
    await request(app).post('/api/simulator/stop');
  });

  it('returns { status: "running" } with default speed 1', async () => {
    const res = await request(app)
      .post('/api/simulator/start')
      .send({ speed: 1 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('running');
  });

  it('returns 400 for invalid speed (e.g. 3)', async () => {
    const res = await request(app)
      .post('/api/simulator/start')
      .send({ speed: 3 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for speed = 0', async () => {
    const res = await request(app)
      .post('/api/simulator/start')
      .send({ speed: 0 });

    expect(res.status).toBe(400);
  });

  it('accepts speed 5 and 10', async () => {
    let res = await request(app).post('/api/simulator/start').send({ speed: 5 });
    expect(res.status).toBe(200);

    await request(app).post('/api/simulator/stop');

    res = await request(app).post('/api/simulator/start').send({ speed: 10 });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/simulator/stop', () => {
  it('returns 200 with status field', async () => {
    const res = await request(app).post('/api/simulator/stop');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });
});

describe('GET /api/simulator/status', () => {
  it('returns running and speed fields', async () => {
    const res = await request(app).get('/api/simulator/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('running');
    expect(res.body).toHaveProperty('speed');
  });
});

// ── 404 fallback ──────────────────────────────────────────────────────────────

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
