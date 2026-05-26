/**
 * Routes: /api/simulator
 */

const express   = require('express');
const router    = express.Router();
const simulator = require('../services/simulatorService');

const VALID_SPEEDS = [1, 5, 10];

// POST /api/simulator/start  body: { speed: 1 | 5 | 10 }
router.post('/start', async (req, res) => {
  try {
    const speed = Number(req.body?.speed ?? 1);

    if (!VALID_SPEEDS.includes(speed)) {
      return res.status(400).json({
        error: `Invalid speed — must be one of: ${VALID_SPEEDS.join(', ')}`,
      });
    }

    const result = simulator.start(speed);
    res.json(result);
  } catch (err) {
    console.error('[simulator] POST /start error:', err.message);
    res.status(500).json({ error: 'Failed to start simulator' });
  }
});

// POST /api/simulator/stop
router.post('/stop', async (req, res) => {
  try {
    const result = simulator.stop();
    res.json(result);
  } catch (err) {
    console.error('[simulator] POST /stop error:', err.message);
    res.status(500).json({ error: 'Failed to stop simulator' });
  }
});

// POST /api/simulator/reset — clears all open check-ins, returns to seeded baseline
router.post('/reset', async (req, res) => {
  try {
    const result = await simulator.reset();
    res.json(result);
  } catch (err) {
    console.error('[simulator] POST /reset error:', err.message);
    res.status(500).json({ error: 'Failed to reset simulator' });
  }
});

// GET /api/simulator/status — convenience endpoint for frontend
router.get('/status', (req, res) => {
  res.json(simulator.getState());
});

module.exports = router;
