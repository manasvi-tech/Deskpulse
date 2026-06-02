/**
 * Routes: /api/locations
 * Handlers call statsService — no business logic here.
 */

const express = require('express');
const router  = express.Router();
const stats   = require('../services/statsService');

// GET /api/locations — all locations with live occupancy + today's revenue
router.get('/', async (req, res) => {
  try {
    const locations = await stats.getAllLocationsWithStats();
    res.json({ locations });
  } catch (err) {
    console.error('[locations] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// GET /api/locations/:id/live — single location snapshot (< 5ms total)
router.get('/:id/live', async (req, res) => {
  try {
    const location = await stats.getLocationLive(req.params.id);
    if (!location) return res.status(404).json({ error: 'Location not found' });
    res.json({ location });
  } catch (err) {
    console.error('[locations] GET /:id/live error:', err.message);
    res.status(500).json({ error: 'Failed to fetch location live data' });
  }
});

// GET /api/locations/:id/analytics?dateRange=7d|30d|90d
router.get('/:id/analytics', async (req, res) => {
  try {
    const { dateRange = '7d' } = req.query;

    if (!['7d', '30d', '90d'].includes(dateRange)) {
      return res.status(400).json({
        error: 'Invalid dateRange — must be one of: 7d, 30d, 90d',
      });
    }

    const analytics = await stats.getLocationAnalytics(req.params.id, dateRange);
    if (!analytics) return res.status(404).json({ error: 'Location not found' });

    res.json({ analytics });
  } catch (err) {
    console.error('[locations] GET /:id/analytics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch location analytics' });
  }
});

module.exports = router;
