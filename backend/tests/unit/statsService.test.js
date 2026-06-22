/**
 * Unit Tests — Stats Service
 *
 * Mocks pg Pool so no live DB is needed.
 * Covers all public functions in statsService.js:
 *   getLiveOccupancy, getTodayRevenue, getAllLocationsWithStats,
 *   getLocationLive, getLocationAnalytics, getCrossLocationRevenue,
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

const LOCATION = {
  id: 'loc-1', name: 'DeskPulse — Test', city: 'Delhi', address: '1 Main St',
  capacity: 200, status: 'active', opens_at: '08:00', closes_at: '22:00',
};

beforeEach(() => jest.clearAllMocks());

// ── getLiveOccupancy ──────────────────────────────────────────────────────────

describe('getLiveOccupancy', () => {
  it('returns the occupancy count for a location', async () => {
    q({ rows: [{ occupancy: 42 }] });
    const result = await stats.getLiveOccupancy('loc-1');
    expect(result).toBe(42);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1]).toEqual(['loc-1']);
  });

  it('returns 0 when no open check-ins exist', async () => {
    q({ rows: [{ occupancy: 0 }] });
    expect(await stats.getLiveOccupancy('loc-2')).toBe(0);
  });
});

// ── getTodayRevenue ───────────────────────────────────────────────────────────

describe('getTodayRevenue', () => {
  it('returns today\'s revenue total', async () => {
    q({ rows: [{ revenue: 15000 }] });
    const result = await stats.getTodayRevenue('loc-1');
    expect(result).toBe(15000);
  });

  it('returns 0 when no payments today', async () => {
    q({ rows: [{ revenue: 0 }] });
    expect(await stats.getTodayRevenue('loc-1')).toBe(0);
  });
});

// ── getAllLocationsWithStats ───────────────────────────────────────────────────

describe('getAllLocationsWithStats', () => {
  it('returns an array of locations with occupancy and revenue', async () => {
    const mockLocations = [
      { ...LOCATION, occupancy: 50, occupancy_pct: 25.0, today_revenue: 7500 },
      { ...LOCATION, id: 'loc-2', name: 'DeskPulse — Bandra', occupancy: 120, occupancy_pct: 48.0, today_revenue: 12000 },
    ];
    q({ rows: mockLocations });

    const result = await stats.getAllLocationsWithStats();
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('occupancy', 50);
    expect(result[0]).toHaveProperty('today_revenue', 7500);
  });

  it('returns empty array when no locations', async () => {
    q({ rows: [] });
    const result = await stats.getAllLocationsWithStats();
    expect(result).toEqual([]);
  });
});

// ── getLocationLive ───────────────────────────────────────────────────────────

describe('getLocationLive', () => {
  it('returns null when location does not exist', async () => {
    q({ rows: [] }); // location lookup returns nothing
    const result = await stats.getLocationLive('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('returns full live snapshot with occupancy, revenue, recent_activity', async () => {
    q(
      { rows: [LOCATION] },                                  // location lookup
      { rows: [{ occupancy: 80 }] },                    // live occupancy
      { rows: [{ revenue: 7500 }] },                    // today's revenue
      { rows: [{ member_name: 'Rahul', checked_in: new Date().toISOString(), checked_out: null, duration_min: null, location_id: LOCATION.id }] } // recent activity
    );

    const result = await stats.getLocationLive(LOCATION.id);

    expect(result).not.toBeNull();
    expect(result.id).toBe(LOCATION.id);
    expect(result.occupancy).toBe(80);
    expect(result.today_revenue).toBe(7500);
    expect(Array.isArray(result.recent_activity)).toBe(true);
    expect(result.recent_activity).toHaveLength(1);
  });

  it('calculates occupancy_pct correctly', async () => {
    q(
      { rows: [{ ...LOCATION, capacity: 100 }] },
      { rows: [{ occupancy: 60 }] },
      { rows: [{ revenue: 0 }] },
      { rows: [] }
    );
    const result = await stats.getLocationLive(LOCATION.id);
    expect(result.occupancy_pct).toBe(60);
  });
});

// ── getLocationAnalytics ──────────────────────────────────────────────────────

describe('getLocationAnalytics', () => {
  const ANALYTICS_ROWS = () => ({
    heatmap:       [{ day_of_week: 1, hour_of_day: 8, checkin_count: 30 }],
    revenue:       [{ date: '2024-05-01', revenue: 1499, payment_count: 1 }],
    expiring_soon: [{ id: 'm1', name: 'Ankit', plan_type: 'day_pass', days_until_expiry: 3 }],
    inactive:      [{ id: 'm2', name: 'Priya', plan_type: 'hot_desk', days_since_checkin: 50 }],
    members:       {
      total_members: 500, active_members: 430, inactive_members: 50, frozen_members: 20,
      day_pass_count: 200, hot_desk_count: 150, dedicated_desk_count: 100, private_office_count: 50,
    },
  });

  it('returns null when location does not exist', async () => {
    q({ rows: [] }); // location lookup
    const result = await stats.getLocationAnalytics('00000000-0000-0000-0000-000000000000', '7d');
    expect(result).toBeNull();
  });

  it('returns analytics object with heatmap, revenue_chart, churn_risk, member_stats for 7d', async () => {
    const r = ANALYTICS_ROWS();
    q(
      { rows: [LOCATION] },           // location check
      { rows: r.heatmap },            // heatmap
      { rows: r.revenue },            // revenue chart
      { rows: r.expiring_soon },      // expiring soon churn
      { rows: r.inactive },           // inactive churn
      { rows: [r.members] }           // member stats
    );

    const result = await stats.getLocationAnalytics(LOCATION.id, '7d');

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('heatmap');
    expect(result).toHaveProperty('revenue_chart');
    expect(result).toHaveProperty('churn_risk');
    expect(result).toHaveProperty('member_stats');
    expect(result.heatmap).toHaveLength(1);
    expect(result.churn_risk).toHaveProperty('expiring_soon');
    expect(result.churn_risk).toHaveProperty('inactive');
  });

  it('works with 30d dateRange', async () => {
    const r = ANALYTICS_ROWS();
    q(
      { rows: [LOCATION] }, { rows: r.heatmap }, { rows: r.revenue },
      { rows: r.expiring_soon }, { rows: r.inactive }, { rows: [r.members] }
    );
    const result = await stats.getLocationAnalytics(LOCATION.id, '30d');
    expect(result).not.toBeNull();
  });

  it('works with 90d dateRange', async () => {
    const r = ANALYTICS_ROWS();
    q(
      { rows: [LOCATION] }, { rows: r.heatmap }, { rows: r.revenue },
      { rows: r.expiring_soon }, { rows: r.inactive }, { rows: [r.members] }
    );
    const result = await stats.getLocationAnalytics(LOCATION.id, '90d');
    expect(result).not.toBeNull();
  });

  it('member_stats includes plan percentages', async () => {
    const r = ANALYTICS_ROWS();
    q(
      { rows: [LOCATION] }, { rows: r.heatmap }, { rows: r.revenue },
      { rows: r.expiring_soon }, { rows: r.inactive }, { rows: [r.members] }
    );
    const result = await stats.getLocationAnalytics(LOCATION.id, '7d');
    expect(result.member_stats).toHaveProperty('day_pass_pct');
    expect(result.member_stats).toHaveProperty('hot_desk_pct');
    expect(result.member_stats).toHaveProperty('dedicated_desk_pct');
    expect(result.member_stats).toHaveProperty('private_office_pct');
  });
});

// ── getCrossLocationRevenue ───────────────────────────────────────────────────

describe('getCrossLocationRevenue', () => {
  it('returns array of locations with revenue data', async () => {
    const mockData = [
      { location_id: 'g1', location_name: 'Bandra', city: 'Mumbai', total_revenue: 50000, payment_count: 35 },
      { location_id: 'g2', location_name: 'Powai',  city: 'Mumbai', total_revenue: 40000, payment_count: 28 },
    ];
    q({ rows: mockData });

    const result = await stats.getCrossLocationRevenue();
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('location_id');
    expect(result[0]).toHaveProperty('total_revenue');
  });
});

// ── getActiveAnomalies ────────────────────────────────────────────────────────

describe('getActiveAnomalies', () => {
  const ANOMALY = {
    id: 'a1', location_id: 'g1', location_name: 'Test Location',
    type: 'no_activity', severity: 'warning',
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

  it('applies locationId filter when provided', async () => {
    q({ rows: [ANOMALY] });
    const result = await stats.getActiveAnomalies({ locationId: 'g1' });
    expect(result).toHaveLength(1);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('location_id');
  });

  it('applies severity filter when provided', async () => {
    q({ rows: [] });
    const result = await stats.getActiveAnomalies({ severity: 'critical' });
    expect(result).toEqual([]);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('severity');
  });

  it('applies both locationId and severity filters together', async () => {
    q({ rows: [ANOMALY] });
    await stats.getActiveAnomalies({ locationId: 'g1', severity: 'warning' });
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('location_id');
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
