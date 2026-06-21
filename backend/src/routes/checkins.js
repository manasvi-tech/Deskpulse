'use strict';

const express      = require('express');
const router       = express.Router();
const pool         = require('../db/pool');
const logger       = require('../utils/logger');
const { authMiddleware, requireLocation } = require('../middleware/auth');
const { broadcastCheckin, broadcastCheckout } = require('../websocket/broadcast');
const statsService = require('../services/statsService');

// POST /api/checkins — Manual check-in by frontdesk or admin
router.post('/', authMiddleware, requireLocation, async (req, res) => {
  try {
    const { member_id } = req.body;
    if (!member_id) return res.status(400).json({ error: 'member_id is required' });

    const { rows: [member] } = await pool.query(
      'SELECT id, name, location_id, status FROM members WHERE id = $1',
      [member_id]
    );
    if (!member) return res.status(404).json({ error: 'Member not found' });

    if (req.user.role === 'frontdesk' && member.location_id !== req.user.location_id) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }

    if (member.status !== 'active') {
      return res.status(400).json({ error: 'Member is not active' });
    }

    const openCheckin = await statsService.getOpenCheckin(member_id);
    if (openCheckin) {
      return res.status(409).json({ error: 'Member is already checked in' });
    }

    const { rows: [checkin] } = await pool.query(
      `INSERT INTO checkins (member_id, location_id, checked_in)
       VALUES ($1, $2, NOW())
       RETURNING id, member_id, location_id, checked_in`,
      [member_id, member.location_id]
    );

    const [occupancy, locRes] = await Promise.all([
      statsService.getLiveOccupancy(member.location_id),
      pool.query(
        'SELECT total_hot_desks + total_dedicated_desks + total_private_offices AS capacity FROM locations WHERE id = $1',
        [member.location_id]
      ),
    ]);

    const capacity     = locRes.rows[0].capacity;
    const capacity_pct = capacity > 0 ? ((occupancy / capacity) * 100).toFixed(1) : '0.0';

    broadcastCheckin({
      location_id:       member.location_id,
      member_name:       member.name,
      timestamp:         checkin.checked_in,
      current_occupancy: occupancy,
      capacity_pct,
    });

    return res.status(201).json({ checkin, current_occupancy: occupancy, capacity_pct });
  } catch (err) {
    logger.error({ err: err.message }, '[checkins] POST / error');
    return res.status(500).json({ error: 'Failed to check in member' });
  }
});

// PATCH /api/checkins/checkout/:memberId — Manual check-out
router.patch('/checkout/:memberId', authMiddleware, requireLocation, async (req, res) => {
  try {
    const { memberId } = req.params;

    const { rows: [member] } = await pool.query(
      'SELECT id, name, location_id FROM members WHERE id = $1',
      [memberId]
    );
    if (!member) return res.status(404).json({ error: 'Member not found' });

    if (req.user.role === 'frontdesk' && member.location_id !== req.user.location_id) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }

    const openCheckin = await statsService.getOpenCheckin(memberId);
    if (!openCheckin) {
      return res.status(404).json({ error: 'No active check-in found for this member' });
    }

    const { rows: [checkin] } = await pool.query(
      `UPDATE checkins SET checked_out = NOW()
       WHERE id = $1
       RETURNING id, member_id, location_id, checked_in, checked_out, duration_min`,
      [openCheckin.id]
    );

    const [occupancy, locRes] = await Promise.all([
      statsService.getLiveOccupancy(member.location_id),
      pool.query(
        'SELECT total_hot_desks + total_dedicated_desks + total_private_offices AS capacity FROM locations WHERE id = $1',
        [member.location_id]
      ),
    ]);

    const capacity     = locRes.rows[0].capacity;
    const capacity_pct = capacity > 0 ? ((occupancy / capacity) * 100).toFixed(1) : '0.0';

    broadcastCheckout({
      location_id:       member.location_id,
      member_name:       member.name,
      timestamp:         checkin.checked_out,
      current_occupancy: occupancy,
      capacity_pct,
    });

    return res.json({ checkin, current_occupancy: occupancy, capacity_pct });
  } catch (err) {
    logger.error({ err: err.message }, '[checkins] PATCH /checkout/:memberId error');
    return res.status(500).json({ error: 'Failed to check out member' });
  }
});

// GET /api/checkins/status/:memberId — Is member currently checked in?
router.get('/status/:memberId', authMiddleware, async (req, res) => {
  try {
    const openCheckin = await statsService.getOpenCheckin(req.params.memberId);
    return res.json({
      isCheckedIn:   !!openCheckin,
      checkin_id:    openCheckin?.id         || null,
      checked_in_at: openCheckin?.checked_in || null,
    });
  } catch (err) {
    logger.error({ err: err.message }, '[checkins] GET /status/:memberId error');
    return res.status(500).json({ error: 'Failed to get check-in status' });
  }
});

module.exports = router;
