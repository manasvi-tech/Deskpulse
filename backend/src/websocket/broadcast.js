/**
 * WebSocket Broadcast Utilities
 * Implements all 5 event types defined in CLAUDE.md with exact payload shapes.
 * All event payloads follow the schema expected by the React frontend.
 */

const { getWSS } = require('./server');

// WebSocket OPEN state constant
const WS_OPEN = 1;

/**
 * Send a JSON payload to every connected client.
 * Silently skips closed / errored connections.
 * @param {object} payload
 * @returns {number} number of clients successfully sent to
 */
function broadcast(payload) {
  const wss = getWSS();
  if (!wss) return 0;

  const msg = JSON.stringify(payload);
  let sent = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === WS_OPEN) {
      try {
        client.send(msg);
        sent++;
      } catch (err) {
        console.error('[ws:broadcast] Send error:', err.message);
      }
    }
  });

  return sent;
}

// ── Event: CHECKIN_EVENT ──────────────────────────────────────────────────────
/**
 * @param {{ gym_id: string, member_name: string, timestamp: string,
 *           current_occupancy: number, capacity_pct: number }} data
 */
function broadcastCheckin(data) {
  return broadcast({
    type: 'CHECKIN_EVENT',
    gym_id:           data.gym_id,
    member_name:      data.member_name,
    timestamp:        data.timestamp,
    current_occupancy: data.current_occupancy,
    capacity_pct:     data.capacity_pct,
  });
}

// ── Event: CHECKOUT_EVENT ────────────────────────────────────────────────────
/**
 * @param {{ gym_id: string, member_name: string, timestamp: string,
 *           current_occupancy: number, capacity_pct: number }} data
 */
function broadcastCheckout(data) {
  return broadcast({
    type: 'CHECKOUT_EVENT',
    gym_id:           data.gym_id,
    member_name:      data.member_name,
    timestamp:        data.timestamp,
    current_occupancy: data.current_occupancy,
    capacity_pct:     data.capacity_pct,
  });
}

// ── Event: PAYMENT_EVENT ─────────────────────────────────────────────────────
/**
 * @param {{ gym_id: string, amount: number, plan_type: string,
 *           member_name: string, today_total: number }} data
 */
function broadcastPayment(data) {
  return broadcast({
    type: 'PAYMENT_EVENT',
    gym_id:      data.gym_id,
    amount:      data.amount,
    plan_type:   data.plan_type,
    member_name: data.member_name,
    today_total: data.today_total,
  });
}

// ── Event: ANOMALY_DETECTED ──────────────────────────────────────────────────
/**
 * @param {{ anomaly_id: string, gym_id: string, gym_name: string,
 *           anomaly_type: string, severity: string, message: string }} data
 */
function broadcastAnomalyDetected(data) {
  return broadcast({
    type:         'ANOMALY_DETECTED',
    anomaly_id:   data.anomaly_id,
    gym_id:       data.gym_id,
    gym_name:     data.gym_name,
    anomaly_type: data.anomaly_type,
    severity:     data.severity,
    message:      data.message,
  });
}

// ── Event: ANOMALY_RESOLVED ──────────────────────────────────────────────────
/**
 * @param {{ anomaly_id: string, gym_id: string, resolved_at: string }} data
 */
function broadcastAnomalyResolved(data) {
  return broadcast({
    type:        'ANOMALY_RESOLVED',
    anomaly_id:  data.anomaly_id,
    gym_id:      data.gym_id,
    resolved_at: data.resolved_at,
  });
}

module.exports = {
  broadcast,
  broadcastCheckin,
  broadcastCheckout,
  broadcastPayment,
  broadcastAnomalyDetected,
  broadcastAnomalyResolved,
};
