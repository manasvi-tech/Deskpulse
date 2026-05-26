/**
 * Routes: /api/gyms
 * Handlers call statsService — no business logic here.
 */

const express = require('express');
const router  = express.Router();
const stats   = require('../services/statsService');

// GET /api/gyms — all gyms with live occupancy + today's revenue
router.get('/', async (req, res) => {
  try {
    const gyms = await stats.getAllGymsWithStats();
    res.json({ gyms });
  } catch (err) {
    console.error('[gyms] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to fetch gyms' });
  }
});

// GET /api/gyms/:id/live — single gym snapshot (< 5ms total)
router.get('/:id/live', async (req, res) => {
  try {
    const gym = await stats.getGymLive(req.params.id);
    if (!gym) return res.status(404).json({ error: 'Gym not found' });
    res.json({ gym });
  } catch (err) {
    console.error('[gyms] GET /:id/live error:', err.message);
    res.status(500).json({ error: 'Failed to fetch gym live data' });
  }
});

// GET /api/gyms/:id/analytics?dateRange=7d|30d|90d
router.get('/:id/analytics', async (req, res) => {
  try {
    const { dateRange = '7d' } = req.query;

    if (!['7d', '30d', '90d'].includes(dateRange)) {
      return res.status(400).json({
        error: 'Invalid dateRange — must be one of: 7d, 30d, 90d',
      });
    }

    const analytics = await stats.getGymAnalytics(req.params.id, dateRange);
    if (!analytics) return res.status(404).json({ error: 'Gym not found' });

    res.json({ analytics });
  } catch (err) {
    console.error('[gyms] GET /:id/analytics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch gym analytics' });
  }
});

module.exports = router;
