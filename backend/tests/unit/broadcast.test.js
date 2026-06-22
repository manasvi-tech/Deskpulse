/**
 * Unit Tests — WebSocket Broadcast Utilities
 *
 * Mocks the WebSocket server (getWSS) so no real network is used.
 * Verifies that each broadcast helper sends the correct payload shape
 * and that broadcast() gracefully handles null wss / closed clients.
 */

// We mock the server module so getWSS() returns our controlled fake
jest.mock('../../src/websocket/server');

const serverMock = require('../../src/websocket/server');
const broadcast  = require('../../src/websocket/broadcast');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a mock connected WebSocket client */
function mockClient(readyState = 1 /* WS_OPEN */) {
  return {
    readyState,
    send: jest.fn(),
  };
}

/** Build a mock WebSocketServer with the given clients */
function mockWSS(clients = []) {
  return {
    clients: new Set(clients),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── broadcast() — base function ───────────────────────────────────────────────

describe('broadcast()', () => {
  it('returns 0 when WebSocket server is not initialised (wss = null)', () => {
    serverMock.getWSS.mockReturnValue(null);
    const sent = broadcast.broadcast({ type: 'TEST' });
    expect(sent).toBe(0);
  });

  it('sends to all OPEN clients and returns the count', () => {
    const c1 = mockClient(1); // OPEN
    const c2 = mockClient(1); // OPEN
    serverMock.getWSS.mockReturnValue(mockWSS([c1, c2]));

    const sent = broadcast.broadcast({ type: 'PING' });

    expect(sent).toBe(2);
    expect(c1.send).toHaveBeenCalledTimes(1);
    expect(c2.send).toHaveBeenCalledTimes(1);
    const msg = JSON.parse(c1.send.mock.calls[0][0]);
    expect(msg).toEqual({ type: 'PING' });
  });

  it('skips clients whose readyState is not OPEN (e.g., CLOSING = 2)', () => {
    const open   = mockClient(1); // WS_OPEN
    const closed = mockClient(3); // WS_CLOSED
    serverMock.getWSS.mockReturnValue(mockWSS([open, closed]));

    const sent = broadcast.broadcast({ type: 'TEST' });
    expect(sent).toBe(1);
    expect(open.send).toHaveBeenCalled();
    expect(closed.send).not.toHaveBeenCalled();
  });

  it('does not throw when a client.send() throws', () => {
    const badClient = { readyState: 1, send: jest.fn().mockImplementation(() => { throw new Error('broken pipe'); }) };
    serverMock.getWSS.mockReturnValue(mockWSS([badClient]));
    expect(() => broadcast.broadcast({ type: 'TEST' })).not.toThrow();
  });
});

// ── broadcastCheckin ──────────────────────────────────────────────────────────

describe('broadcastCheckin()', () => {
  it('sends a CHECKIN_EVENT with all required fields', () => {
    const client = mockClient();
    serverMock.getWSS.mockReturnValue(mockWSS([client]));

    broadcast.broadcastCheckin({
      location_id: 'g1', member_name: 'Rahul', timestamp: '2024-01-01T08:00:00Z',
      current_occupancy: 50, capacity_pct: 25.0,
    });

    const msg = JSON.parse(client.send.mock.calls[0][0]);
    expect(msg.type).toBe('CHECKIN_EVENT');
    expect(msg.location_id).toBe('g1');
    expect(msg.member_name).toBe('Rahul');
    expect(msg).toHaveProperty('current_occupancy', 50);
    expect(msg).toHaveProperty('capacity_pct', 25.0);
  });
});

// ── broadcastCheckout ─────────────────────────────────────────────────────────

describe('broadcastCheckout()', () => {
  it('sends a CHECKOUT_EVENT with all required fields', () => {
    const client = mockClient();
    serverMock.getWSS.mockReturnValue(mockWSS([client]));

    broadcast.broadcastCheckout({
      location_id: 'g1', member_name: 'Priya', timestamp: '2024-01-01T09:00:00Z',
      current_occupancy: 48, capacity_pct: 24.0,
    });

    const msg = JSON.parse(client.send.mock.calls[0][0]);
    expect(msg.type).toBe('CHECKOUT_EVENT');
    expect(msg.location_id).toBe('g1');
    expect(msg.member_name).toBe('Priya');
  });
});

// ── broadcastPayment ──────────────────────────────────────────────────────────

describe('broadcastPayment()', () => {
  it('sends a PAYMENT_EVENT with all required fields', () => {
    const client = mockClient();
    serverMock.getWSS.mockReturnValue(mockWSS([client]));

    broadcast.broadcastPayment({
      location_id: 'g1', amount: 3999, plan_type: 'hot_desk',
      member_name: 'Ankit', today_total: 45000,
    });

    const msg = JSON.parse(client.send.mock.calls[0][0]);
    expect(msg.type).toBe('PAYMENT_EVENT');
    expect(msg.amount).toBe(3999);
    expect(msg.plan_type).toBe('hot_desk');
    expect(msg.today_total).toBe(45000);
  });
});

// ── broadcastAnomalyDetected ──────────────────────────────────────────────────

describe('broadcastAnomalyDetected()', () => {
  it('sends an ANOMALY_DETECTED event with all required fields', () => {
    const client = mockClient();
    serverMock.getWSS.mockReturnValue(mockWSS([client]));

    broadcast.broadcastAnomalyDetected({
      anomaly_id: 'a1', location_id: 'g1', location_name: 'DeskPulse Bandra',
      anomaly_type: 'overbooking', severity: 'critical',
      message: 'At 95% capacity',
    });

    const msg = JSON.parse(client.send.mock.calls[0][0]);
    expect(msg.type).toBe('ANOMALY_DETECTED');
    expect(msg.anomaly_id).toBe('a1');
    expect(msg.anomaly_type).toBe('overbooking');
    expect(msg.severity).toBe('critical');
  });
});

// ── broadcastAnomalyResolved ──────────────────────────────────────────────────

describe('broadcastAnomalyResolved()', () => {
  it('sends an ANOMALY_RESOLVED event with all required fields', () => {
    const client = mockClient();
    serverMock.getWSS.mockReturnValue(mockWSS([client]));

    const resolvedAt = new Date().toISOString();
    broadcast.broadcastAnomalyResolved({
      anomaly_id: 'a1', location_id: 'g1', resolved_at: resolvedAt,
    });

    const msg = JSON.parse(client.send.mock.calls[0][0]);
    expect(msg.type).toBe('ANOMALY_RESOLVED');
    expect(msg.anomaly_id).toBe('a1');
    expect(msg.resolved_at).toBe(resolvedAt);
  });
});
