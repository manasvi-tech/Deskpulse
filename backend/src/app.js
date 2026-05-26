/**
 * WTF LivePulse — Express Application
 * Entry point: configures middleware, routes, WebSocket, and background jobs.
 * Calls start() only when invoked directly (not when required by tests).
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const http    = require('http');

const pool = require('./db/pool');

// ── Route imports ────────────────────────────────────────────────────────────
const gymsRouter      = require('./routes/gyms');
const anomaliesRouter = require('./routes/anomalies');
const analyticsRouter = require('./routes/analytics');
const simulatorRouter = require('./routes/simulator');

// ── App setup ────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// ── Health check (used by Docker healthcheck + frontend depends_on) ──────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api/gyms',      gymsRouter);
app.use('/api/anomalies', anomaliesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/simulator', simulatorRouter);

// ── 404 fallback ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Startup sequence ─────────────────────────────────────────────────────────
async function start() {
  // Verify DB connectivity and seed status
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM gyms');
    if (rows[0].cnt === 0) {
      console.log('[app] No gyms found — seed should have run via docker-entrypoint-initdb.d');
    } else {
      console.log(`[app] Database ready: ${rows[0].cnt} gyms loaded`);
    }
  } catch (err) {
    console.error('[app] DB check failed:', err.message);
  }

  // Attach WebSocket server to the HTTP server
  const { initWebSocket } = require('./websocket/server');
  initWebSocket(server);

  // Start anomaly detection cron (every 30s) + MV refresh (every 15min)
  const { startAnomalyDetector } = require('./jobs/anomalyDetector');
  const { scheduleMVRefresh }    = require('./jobs/simulator');
  startAnomalyDetector();
  scheduleMVRefresh();

  // Begin listening
  server.listen(PORT, () => {
    console.log(`[app] WTF LivePulse backend running on port ${PORT}`);
  });
}

// Only start server when invoked directly (not when imported by tests)
if (require.main === module) {
  start();
}

module.exports = { app, server };
