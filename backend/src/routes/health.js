const express = require('express');
const pool    = require('../db/pool');
const { isRunning } = require('../services/simulatorService');

const router = express.Router();

router.get('/', async (req, res) => {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    const dbResponseMs = Date.now() - start;
    return res.status(200).json({
      status:            'ok',
      db:                'connected',
      db_response_ms:    dbResponseMs,
      uptime_seconds:    Math.floor(process.uptime()),
      demo_mode:         process.env.DEMO_MODE === 'true',
      simulator_running: isRunning(),
      timestamp:         new Date().toISOString(),
    });
  } catch (err) {
    return res.status(503).json({
      status:    'error',
      db:        'disconnected',
      error:     err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
