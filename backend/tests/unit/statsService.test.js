/**
 * Unit Tests — Stats Service
 *
 * Mocks pg Pool so no live DB is needed.
 * Covers all 9 public functions in statsService.js:
 *   getLiveOccupancy, getTodayRevenue, getAllGymsWithStats,
 *   getGymLive, getGymAnalytics, getCrossGymRevenue,
 *   getActiveAnomalies, getAnomalyById, dismissAnomaly
 */

// pool.js exports a pg.Pool instance — .query() is on Pool.prototype, not an
// own property, so auto-mock won't mock it.  Use a factory.
jest.mock('../../src/db/pool', () => ({
  query: jest.fn(),
  on:    jest.fn(),
}));

const pool = require('../../src/db/pool');
const stats = require('../../src/services/statsService');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Queue N mock return values for successive pool.query calls. */
function q(...results) {
  results.forEach((r) => pool.query.mockResolvedValueOnce(r));
}

const GYM = {
  id: 'gym-1', name: 'WTF Gyms — Test', city: 'Delhi', address: '1 Main St',
  capacity: 200, status: 'active', opens_at: '06:00', closes_at: '22:00',
};

beforeEach(() => jest.clearAllMocks());

// ── getLiveOccupancy ──────────────────────────────────────────────────────────

describe('getLiveOccupancy', () => {
  it('returns the occupancy count for a gym', async () => {
    q({ rows: [{ occupancy: 42 }] });
    const result = await stats.getLiveOccupancy('gym-1');
    expect(result).toBe(42);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1]).toEqual(['gym-1']);
  });

  it('returns 0 when no open check-ins exist', async () => {
    q({ rows: [{ occupancy: 0 }] });
    expect(await stats.getLiveOccupancy('gym-2')).toBe(0);
  });
});

// ── getTodayRevenue ───────────────────────────────────────────────────────────

describe('getTodayRevenue', () => {
  it('returns today\'s revenue total', async () => {
    q({ rows: [{ revenue: 15000 }] });
    const result = await stats.getTodayRevenue('gym-1');
    expect(result).toBe(15000);
  });

  it('returns 0 when no payments today', async () => {
    q({ rows: [{ revenue: 0 }] });
    expect(await stats.getTodayRevenue('gym-1')).toBe(0);
  });
});

// ── getAllGymsWithStats ────────────────────────────────────────────────────────

describe('getAllGymsWithStats', () => {
  it('returns an array of gyms with occupancy and revenue', async () => {
    const mockGyms = [
      { ...GYM, occupancy: 50, occupancy_pct: 25.0, today_revenue: 7500 },
      { ...GYM, id: 'gym-2', name: 'WTF Gyms — Bandra', occupancy: 120, occupancy_pct: 48.0, today_revenue: 12000 },
    ];
    q({ rows: mockGyms });

    const result = await stats.getAllGymsWithStats();
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('occupancy', 50);
    expect(result[0]).toHaveProperty('today_revenue', 7500);
  });

  it('returns empty array when no gyms', async () => {
    q({ rows: [] });
    const result = await stats.getAllGymsWithStats();
    expect(result).toEqual([]);
  });
});

// ── getGymLive ────────────────────────────────────────────────────────────────

describe('getGymLive', () => {
  it('returns null when gym does not exist', async () => {
    q({ rows: [] }); // gym lookup returns nothing
    const result = await stats.getGymLive('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('returns full live snapshot with occupancy, revenue, recent_activity', async () => {
    q(
      { rows: [GYM] },                                  // gym lookup
      { rows: [{ occupancy: 80 }] },                    // live occupancy
      { rows: [{ revenue: 7500 }] },                    // today's revenue
      { rows: [{ member_name: 'Rahul', checked_in: new Date().toISOString(), checked_out: null, duration_min: null, gym_id: GYM.id }] } // recent activity
    );

    const result = await stats.getGymLive(GYM.id);

    expect(result).not.toBeNull();
    expect(result.id).toBe(GYM.id);
    expect(result.occupancy).toBe(80);
    expect(result.today_revenue).toBe(7500);
    expect(Array.isArray(result.recent_activity)).toBe(true);
    expect(result.recent_activity).toHaveLength(1);
  });

  it('calculates occupancy_pct correctly', async () => {
    q(
      { rows: [{ ...GYM, capacity: 100 }] },
      { rows: [{ occupancy: 60 }] },
      { rows: [{ revenue: 0 }] },
      { rows: [] }
    );
    const result = await stats.getGymLive(GYM.id);
    expect(result.occupancy_pct).toBe(60);
  });
});

// ── getGymAnalytics ───────────────────────────────────────────────────────────

describe('getGymAnalytics', () => {
  const ANALYTICS_ROWS = () => ({
    heatmap:  [{ day_of_week: 1, hour_of_day: 8, checkin_count: 30 }],
    revenue:  [{ date: '2024-05-01', revenue: 1499, payment_count: 1 }],
    churn:    [{ id: 'm1', name: 'Ankit', risk_level: 'HIGH', days_since_checkin: 50 }],
    members:  { total_members: 500, active_members: 430, inactive_members: 50, frozen_members: 20,
                monthly_count: 250, quarterly_count: 200, annual_count: 50 },
  });

  it('returns null when gym does not exist', async () => {
    q({ rows: [] }); // gym lookup
    const result = await stats.getGymAnalytics('00000000-0000-0000-0000-000000000000', '7d');
    expect(result).toBeNull();
  });

  it('returns analytics object with heatmap, revenue_chart, churn_risk, member_stats for 7d', async () => {
    const r = ANALYTICS_ROWS();
    q(
      { rows: [GYM] },           // gym check
      { rows: r.heatmap },       // heatmap
      { rows: r.revenue },       // revenue chart
      { rows: r.churn },         // churn risk
      { rows: [r.members] }      // member stats
    );

    const result = await stats.getGymAnalytics(GYM.id, '7d');

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('heatmap');
    expect(result).toHaveProperty('revenue_chart');
    expect(result).toHaveProperty('churn_risk');
    expect(result).toHaveProperty('member_stats');
    expect(result.heatmap).toHaveLength(1);
    expect(result.churn_risk).toHaveLength(1);
  });

  it('works with 30d dateRange', async () => {
    const r = ANALYTICS_ROWS();
    q({ rows: [GYM] }, { rows: r.heatmap }, { rows: r.revenue }, { rows: r.churn }, { rows: [r.members] });
    const result = await stats.getGymAnalytics(GYM.id, '30d');
    expect(result).not.toBeNull();
  });

  it('works with 90d dateRange', async () => {
    const r = ANALYTICS_ROWS();
    q({ rows: [GYM] }, { rows: r.heatmap }, { rows: r.revenue }, { rows: r.churn }, { rows: [r.members] });
    const result = await stats.getGymAnalytics(GYM.id, '90d');
    expect(result).not.toBeNull();
  });

  it('member_stats includes plan percentages', async () => {
    const r = ANALYTICS_ROWS();
    q({ rows: [GYM] }, { rows: r.heatmap }, { rows: r.revenue }, { rows: r.churn }, { rows: [r.members] });
    const result = await stats.getGymAnalytics(GYM.id, '7d');
    expect(result.member_stats).toHaveProperty('monthly_pct');
    expect(result.member_stats).toHaveProperty('quarterly_pct');
    expect(result.member_stats).toHaveProperty('annual_pct');
  });
});

// ── getCrossGymRevenue ────────────────────────────────────────────────────────

describe('getCrossGymRevenue', () => {
  it('returns array of gyms with revenue data', async () => {
    const mockData = [
      { gym_id: 'g1', gym_name: 'Bandra', city: 'Mumbai', total_revenue: 50000, payment_count: 35 },
      { gym_id: 'g2', gym_name: 'Powai',  city: 'Mumbai', total_revenue: 40000, payment_count: 28 },
    ];
    q({ rows: mockData });

    const result = await stats.getCrossGymRevenue();
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('gym_id');
    expect(result[0]).toHaveProperty('total_revenue');
  });
});

// ── getActiveAnomalies ────────────────────────────────────────────────────────

describe('getActiveAnomalies', () => {
  const ANOMALY = {
    id: 'a1', gym_id: 'g1', gym_name: 'Test Gym',
    type: 'zero_checkins', severity: 'warning',
    message: 'No check-ins', resolved: false, dismissed: false,
    detected_at: new Date().toISOString(), resolved_at: null,
  };

  it('returns all active anomalies when called with no filters', async () => {
    q({ rows: [ANOMALY] });
    const result = await stats.getActiveAnomalies();
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('id', 'a1');
  });

  it('returns empty array when no active anomalies', async () => {
    q({ rows: [] });
    const result = await stats.getActiveAnomalies();
    expect(result).toEqual([]);
  });

  it('applies gymId filter when provided', async () => {
    q({ rows: [ANOMALY] });
    const result = await stats.getActiveAnomalies({ gymId: 'g1' });
    expect(result).toHaveLength(1);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('gym_id');
  });

  it('applies severity filter when provided', async () => {
    q({ rows: [] });
    const result = await stats.getActiveAnomalies({ severity: 'critical' });
    expect(result).toEqual([]);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('severity');
  });

  it('applies both gymId and severity filters together', async () => {
    q({ rows: [ANOMALY] });
    await stats.getActiveAnomalies({ gymId: 'g1', severity: 'warning' });
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('gym_id');
    expect(sql).toContain('severity');
  });
});

// ── getAnomalyById ────────────────────────────────────────────────────────────

describe('getAnomalyById', () => {
  it('returns the anomaly when found', async () => {
    q({ rows: [{ id: 'a1', severity: 'warning', resolved: false }] });
    const result = await stats.getAnomalyById('a1');
    expect(result).toHaveProperty('id', 'a1');
  });

  it('returns null when anomaly does not exist', async () => {
    q({ rows: [] });
    const result = await stats.getAnomalyById('nonexistent');
    expect(result).toBeNull();
  });
});

// ── dismissAnomaly ────────────────────────────────────────────────────────────

describe('dismissAnomaly', () => {
  it('returns { error: "not_found" } when anomaly does not exist', async () => {
    q({ rows: [] }); // getAnomalyById returns nothing
    const result = await stats.dismissAnomaly('nonexistent');
    expect(result).toEqual({ error: 'not_found' });
  });

  it('returns { error: "forbidden" } when anomaly is CRITICAL', async () => {
    q({ rows: [{ id: 'a1', severity: 'critical', resolved: false }] });
    const result = await stats.dismissAnomaly('a1');
    expect(result).toEqual({ error: 'forbidden' });
  });

  it('returns { error: "already_resolved" } when anomaly is already resolved', async () => {
    q({ rows: [{ id: 'a1', severity: 'warning', resolved: true }] });
    const result = await stats.dismissAnomaly('a1');
    expect(result).toEqual({ error: 'already_resolved' });
  });

  it('dismisses a WARNING anomaly and returns it', async () => {
    const anomaly = { id: 'a1', severity: 'warning', resolved: false, dismissed: false };
    q(
      { rows: [anomaly] },                                // getAnomalyById
      { rows: [{ ...anomaly, dismissed: true }] }        // UPDATE SET dismissed=TRUE
    );
    const result = await stats.dismissAnomaly('a1');
    expect(result).toHaveProperty('anomaly');
    expect(result.anomaly.dismissed).toBe(true);
  });
});
