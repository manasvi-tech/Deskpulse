require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const http    = require('http');

const pool = require('./db/pool');
const locationsRouter = require('./routes/locations');
const anomaliesRouter = require('./routes/anomalies');
const analyticsRouter = require('./routes/analytics');
const simulatorRouter = require('./routes/simulator');
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
  
app.use('/api/locations', locationsRouter);
app.use('/api/anomalies', anomaliesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/simulator', simulatorRouter);
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  // Verify DB connectivity; run seed if empty
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM locations');
    if (rows[0].cnt === 0) {
      console.log('[app] No locations found — running seed...');
      const { seed } = require('./db/seeds/seed');
      await seed();
    } else {
      console.log(`[app] Database ready: ${rows[0].cnt} locations loaded`);
    }
  } catch (err) {
    console.error('[app] DB check / seed failed:', err.message);
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
