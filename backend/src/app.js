require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const cookieParser = require('cookie-parser');
const morgan     = require('morgan');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const logger = require('./utils/logger');
const pool   = require('./db/pool');

const healthRouter    = require('./routes/health');
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

// ── Health check — ABSOLUTE FIRST: no auth, no rate limit, no demoGuard ─────
app.use('/api/health', healthRouter);

// ── Helmet — security headers ─────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false, // React assets cross-origin
  contentSecurityPolicy:     false, // React SPA handles its own CSP
}));

// ── CORS — credentials required for httpOnly cookie auth ──────────────────────
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn({ origin }, '[cors] Blocked request from unauthorized origin');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
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

// ── HTTP request logging (skips /api/health — fires every 30s) ───────────────
const morganMiddleware = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    stream: { write: (message) => logger.info({ type: 'http' }, message.trim()) },
    skip:   (req) => req.url === '/api/health',
  }
);
app.use(morganMiddleware);

// ── Rate limiting — health is mounted above so it's exempt ───────────────────
const apiLimiter = rateLimit({
  windowMs:       60 * 1000,
  max:            200,
  message:        { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders:  false,
});

const authLimiter = rateLimit({
  windowMs:       60 * 1000,
  max:            10,
  message:        { error: 'Too many login attempts. Please wait 1 minute.' },
  standardHeaders: true,
  legacyHeaders:  false,
  handler: (req, res, _next, options) => {
    logger.warn({ ip: req.ip }, '[auth] Rate limit exceeded on login');
    res.status(429).json(options.message);
  },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);

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
  logger.error({ err: err.message }, '[app] Unhandled request error');
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  // Verify DB connectivity; run seed if empty
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM locations');
    if (rows[0].cnt === 0) {
      logger.info('[app] No locations found — running seed...');
      const { seed } = require('./db/seeds/seed');
      await seed();
    } else {
      logger.info({ count: rows[0].cnt }, '[app] Database ready');
    }
  } catch (err) {
    logger.error({ err: err.message }, '[app] DB check / seed failed');
  }

  try {
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY location_hourly_stats');
    logger.info('[mv] location_hourly_stats refreshed on startup');
  } catch (err) {
    logger.error({ err: err.message }, '[mv] Failed to refresh location_hourly_stats');
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
    logger.info('[app] AUTO_START_SIMULATOR=true — simulator started at 1x');
  }

  // Begin listening
  server.listen(PORT, () => {
    logger.info({ port: PORT }, '[app] DeskPulse backend running');
  });
}

// ── Unhandled exception / rejection guards ────────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, '[app] Uncaught exception — shutting down');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason: String(reason) }, '[app] Unhandled promise rejection');
});

// ── Graceful shutdown on SIGTERM ──────────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('[app] SIGTERM received — starting graceful shutdown');
  server.close(() => {
    logger.info('[app] HTTP server closed');
    pool.end(() => {
      logger.info('[app] Database pool closed');
      process.exit(0);
    });
  });
});

// Only start server when invoked directly (not when imported by tests)
if (require.main === module) {
  start();
}

module.exports = { app, server };
