require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const http         = require('http');
const cookieParser = require('cookie-parser');

const pool = require('./db/pool');

const locationsRouter = require('./routes/locations');
const anomaliesRouter = require('./routes/anomalies');
const analyticsRouter = require('./routes/analytics');
const simulatorRouter = require('./routes/simulator');
const authRouter      = require('./routes/auth');
const usersRouter     = require('./routes/users');
const membersRouter   = require('./routes/members');
const checkinsRouter  = require('./routes/checkins');

const { authMiddleware, requireRole } = require('./middleware/auth');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

// ── CORS — credentials required for httpOnly cookie auth ──────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(cookieParser());

// ── Demo mode guard — blocks all writes except allowed paths ──────────────────
const DEMO_ALLOWED_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/simulator/start',
  '/api/simulator/stop',
  '/api/simulator/reset',
  '/api/checkins',   // covers POST /api/checkins and PATCH /api/checkins/checkout/*
];

const demoGuard = (req, res, next) => {
  if (process.env.DEMO_MODE === 'true' && req.method !== 'GET') {
    const isDismiss = req.path.includes('/dismiss');
    const isRenew   = req.path.endsWith('/renew');
    const isAllowed = DEMO_ALLOWED_PREFIXES.some(p => req.path.startsWith(p));
    if (!isAllowed && !isDismiss && !isRenew) {
      return res.status(403).json({ demo: true, message: 'Not allowed in demo mode' });
    }
  }
  next();
};
app.use(demoGuard);

// ── Health check (used by Docker healthcheck + frontend depends_on) ──────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// ── Auth routes (no auth middleware — login/logout/me are public or self-auth) ─
app.use('/api/auth', authRouter);

// ── Protected routes ──────────────────────────────────────────────────────────

// For /api/locations/:id/live and /:id/analytics, frontdesk can only see their own location.
// We extract the UUID from originalUrl because req.params isn't populated at app.use level.
const locationScopeGuard = (req, res, next) => {
  if (!req.user || req.user.role === 'super_admin') return next();
  const match = req.originalUrl.match(/\/api\/locations\/([^/?]+)\/(live|analytics)/);
  if (match) {
    const locationId = match[1];
    if (locationId !== req.user.location_id) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }
  }
  next();
};

app.use('/api/locations', authMiddleware, locationScopeGuard, locationsRouter);
app.use('/api/anomalies', authMiddleware, anomaliesRouter);
app.use('/api/analytics', authMiddleware, analyticsRouter);
app.use('/api/simulator', authMiddleware, requireRole('super_admin'), simulatorRouter);

app.use('/api/users',    usersRouter);    // auth + super_admin enforced inside the router
app.use('/api/members',  membersRouter);  // auth enforced inside the router
app.use('/api/checkins', checkinsRouter); // auth enforced inside the router

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

  try {
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY location_hourly_stats');
    console.log('[mv] location_hourly_stats refreshed on startup');
  } catch (err) {
    console.error('[mv] Failed to refresh location_hourly_stats:', err.message);
  }

  // Attach WebSocket server to the HTTP server
  const { initWebSocket } = require('./websocket/server');
  initWebSocket(server);

  // Start anomaly detection cron (every 30s) + MV refresh (every 15min)
  const { startAnomalyDetector } = require('./jobs/anomalyDetector');
  const { scheduleMVRefresh }    = require('./jobs/simulator');
  startAnomalyDetector();
  scheduleMVRefresh();

  // Auto-start simulator for demo deployments (keeps the dashboard live without manual intervention)
  if (process.env.AUTO_START_SIMULATOR === 'true') {
    const { start: startSim } = require('./services/simulatorService');
    startSim(1);
    console.log('[app] AUTO_START_SIMULATOR=true — simulator started at 1x');
  }

  // Begin listening
  server.listen(PORT, () => {
    console.log(`[app] DeskPulse backend running on port ${PORT}`);
  });
}

// Only start server when invoked directly (not when imported by tests)
if (require.main === module) {
  start();
}

module.exports = { app, server };
