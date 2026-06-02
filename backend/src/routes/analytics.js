/**
 * Routes: /api/analytics
 */

const express = require('express');
const router  = express.Router();
const stats   = require('../services/statsService');

// GET /api/analytics/cross-location — revenue comparison, all locations, last 30 days (< 2ms)
router.get('/cross-location', async (req, res) => {
  try {
    const locations = await stats.getCrossLocationRevenue();
    res.json({ locations });
  } catch (err) {
    console.error('[analytics] GET /cross-location error:', err.message);
    res.status(500).json({ error: 'Failed to fetch cross-location analytics' });
  }
});

module.exports = router;
