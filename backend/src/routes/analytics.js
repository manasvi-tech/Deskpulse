/**
 * Routes: /api/analytics
 */

const express = require('express');
const router  = express.Router();
const stats   = require('../services/statsService');

// GET /api/analytics/cross-gym — revenue comparison for all gyms, last 30 days (< 2ms)
router.get('/cross-gym', async (req, res) => {
  try {
    const gyms = await stats.getCrossGymRevenue();
    res.json({ gyms });
  } catch (err) {
    console.error('[analytics] GET /cross-gym error:', err.message);
    res.status(500).json({ error: 'Failed to fetch cross-gym analytics' });
  }
});

module.exports = router;
