/**
 * Routes: /api/anomalies
 */

const express = require('express');
const router  = express.Router();
const stats   = require('../services/statsService');

const VALID_SEVERITIES = ['warning', 'critical'];

// GET /api/anomalies?location_id=<uuid>&severity=warning|critical
router.get('/', async (req, res) => {
  try {
    const { location_id, severity } = req.query;

    if (severity && !VALID_SEVERITIES.includes(severity)) {
      return res.status(400).json({
        error: `Invalid severity — must be one of: ${VALID_SEVERITIES.join(', ')}`,
      });
    }

    const anomalies = await stats.getActiveAnomalies({ locationId: location_id, severity });
    res.json({ anomalies });
  } catch (err) {
    console.error('[anomalies] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to fetch anomalies' });
  }
});

// PATCH /api/anomalies/:id/dismiss — WARNING only; returns 403 for CRITICAL
router.patch('/:id/dismiss', async (req, res) => {
  try {
    const result = await stats.dismissAnomaly(req.params.id);

    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'Anomaly not found' });
    }
    if (result.error === 'forbidden') {
      return res.status(403).json({ error: 'Critical anomalies cannot be dismissed' });
    }
    if (result.error === 'already_resolved') {
      return res.status(400).json({ error: 'Anomaly is already resolved' });
    }

    res.json({ anomaly: result.anomaly });
  } catch (err) {
    console.error('[anomalies] PATCH /:id/dismiss error:', err.message);
    res.status(500).json({ error: 'Failed to dismiss anomaly' });
  }
});

module.exports = router;
