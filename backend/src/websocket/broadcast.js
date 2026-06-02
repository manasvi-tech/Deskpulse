/**
 * WebSocket Broadcast Utilities
 * Implements all 5 event types defined in CLAUDE.md with exact payload shapes.
 * All event payloads follow the schema expected by the React frontend.
 */

const { getWSS } = require('./server');

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
function broadcastCheckin(data) {
  return broadcast({
    type:              'CHECKIN_EVENT',
    location_id:       data.location_id,
    member_name:       data.member_name,
    timestamp:         data.timestamp,
    current_occupancy: data.current_occupancy,
    capacity_pct:      data.capacity_pct,
  });
}

// ── Event: CHECKOUT_EVENT ─────────────────────────────────────────────────────
function broadcastCheckout(data) {
  return broadcast({
    type:              'CHECKOUT_EVENT',
    location_id:       data.location_id,
    member_name:       data.member_name,
    timestamp:         data.timestamp,
    current_occupancy: data.current_occupancy,
    capacity_pct:      data.capacity_pct,
  });
}

// ── Event: PAYMENT_EVENT ──────────────────────────────────────────────────────
function broadcastPayment(data) {
  return broadcast({
    type:         'PAYMENT_EVENT',
    location_id:  data.location_id,
    amount:       data.amount,
    plan_type:    data.plan_type,
    member_name:  data.member_name,
    today_total:  data.today_total,
  });
}

// ── Event: ANOMALY_DETECTED ───────────────────────────────────────────────────
function broadcastAnomalyDetected(data) {
  return broadcast({
    type:          'ANOMALY_DETECTED',
    anomaly_id:    data.anomaly_id,
    location_id:   data.location_id,
    location_name: data.location_name,
    anomaly_type:  data.anomaly_type,
    severity:      data.severity,
    message:       data.message,
  });
}

// ── Event: ANOMALY_RESOLVED ───────────────────────────────────────────────────
function broadcastAnomalyResolved(data) {
  return broadcast({
    type:        'ANOMALY_RESOLVED',
    anomaly_id:  data.anomaly_id,
    location_id: data.location_id,
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
