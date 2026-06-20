'use strict';

const express        = require('express');
const router         = express.Router();
const { randomUUID } = require('crypto');
const pool           = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const statsService   = require('../services/statsService');
const { broadcastPayment } = require('../websocket/broadcast');

const PLAN_DURATION = { day_pass: 1, hot_desk: 30, dedicated_desk: 90, private_office: 365 };
const PLAN_AMOUNT   = { day_pass: 499, hot_desk: 3999, dedicated_desk: 7999, private_office: 24999 };

router.use(authMiddleware);

// GET /api/members — list members with pagination and optional search
router.get('/', async (req, res) => {
  try {
    let { location_id, search = '', page = 1, limit = 20 } = req.query;
    page  = Math.max(1, parseInt(page,  10) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    if (req.user.role === 'frontdesk') {
      if (location_id && location_id !== req.user.location_id) {
        return res.status(403).json({ error: 'Access denied to this location' });
      }
      location_id = req.user.location_id;
    }

    const [members, total] = await Promise.all([
      statsService.getMembersWithStatus(location_id || null, search, page, limit),
      statsService.getMembersCount(location_id || null, search),
    ]);

    return res.json({
      members,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[members] GET / error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// POST /api/members — register a new member with membership + payment in one transaction
router.post('/', async (req, res) => {
  try {
    let { name, email, phone, plan_type, location_id, start_date } = req.body;

    if (!name || !email || !phone || !plan_type || !location_id) {
      return res.status(400).json({ error: 'name, email, phone, plan_type, and location_id are required' });
    }
    if (!PLAN_AMOUNT[plan_type]) {
      return res.status(400).json({ error: 'plan_type must be day_pass, hot_desk, dedicated_desk, or private_office' });
    }

    // Frontdesk can only register members at their own location
    if (req.user.role === 'frontdesk') {
      location_id = req.user.location_id;
    }

    const startDate = start_date ? new Date(start_date) : new Date();
    const endDate   = new Date(startDate);
    endDate.setDate(endDate.getDate() + PLAN_DURATION[plan_type]);

    const memberId     = randomUUID();
    const membershipId = randomUUID();
    const paymentId    = randomUUID();
    const now          = new Date();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [member] } = await client.query(
        `INSERT INTO members (id, location_id, name, email, phone, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)
         RETURNING id, location_id, name, email, phone, status, created_at`,
        [memberId, location_id, name, email.toLowerCase().trim(), phone, now]
      );

      const { rows: [membership] } = await client.query(
        `INSERT INTO memberships (id, member_id, location_id, plan_type, start_date, end_date, status, member_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', 'new', $7)
         RETURNING id, member_id, plan_type, start_date, end_date, status`,
        [membershipId, memberId, location_id, plan_type, startDate, endDate, now]
      );

      const { rows: [payment] } = await client.query(
        `INSERT INTO payments (id, member_id, membership_id, location_id, amount, payment_type, paid_at)
         VALUES ($1, $2, $3, $4, $5, 'new', NOW())
         RETURNING id, member_id, amount, payment_type, paid_at`,
        [paymentId, memberId, membershipId, location_id, PLAN_AMOUNT[plan_type]]
      );

      await client.query('COMMIT');
      return res.status(201).json({ member, membership, payment });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    console.error('[members] POST / error:', err.message);
    return res.status(500).json({ error: 'Failed to register member' });
  }
});

// PATCH /api/members/:id — update member status
router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body;

    if (!['active', 'inactive', 'frozen'].includes(status)) {
      return res.status(400).json({ error: 'status must be active, inactive, or frozen' });
    }

    const { rows: [existing] } = await pool.query(
      'SELECT id, location_id FROM members WHERE id = $1',
      [req.params.id]
    );
    if (!existing) return res.status(404).json({ error: 'Member not found' });

    if (req.user.role === 'frontdesk' && existing.location_id !== req.user.location_id) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }

    const { rows: [member] } = await pool.query(
      'UPDATE members SET status = $1 WHERE id = $2 RETURNING id, name, email, status, location_id',
      [status, req.params.id]
    );
    return res.json({ member });
  } catch (err) {
    console.error('[members] PATCH /:id error:', err.message);
    return res.status(500).json({ error: 'Failed to update member' });
  }
});

// DELETE /api/members/:id — soft delete: status=inactive, cancel active memberships
router.delete('/:id', async (req, res) => {
  try {
    const { rows: [existing] } = await pool.query(
      'SELECT id, location_id FROM members WHERE id = $1',
      [req.params.id]
    );
    if (!existing) return res.status(404).json({ error: 'Member not found' });

    if (req.user.role === 'frontdesk' && existing.location_id !== req.user.location_id) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        "UPDATE members SET status = 'inactive' WHERE id = $1",
        [req.params.id]
      );
      await client.query(
        "UPDATE memberships SET status = 'cancelled' WHERE member_id = $1 AND status = 'active'",
        [req.params.id]
      );

      await client.query('COMMIT');
      return res.json({ success: true });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[members] DELETE /:id error:', err.message);
    return res.status(500).json({ error: 'Failed to delete member' });
  }
});

// POST /api/members/:id/renew — renew or upgrade membership plan
router.post('/:id/renew', async (req, res) => {
  try {
    const { plan_type, start_date } = req.body;

    if (!PLAN_AMOUNT[plan_type]) {
      return res.status(400).json({ error: 'plan_type must be day_pass, hot_desk, dedicated_desk, or private_office' });
    }

    const { rows: [member] } = await pool.query(
      'SELECT id, name, location_id, status FROM members WHERE id = $1',
      [req.params.id]
    );
    if (!member) return res.status(404).json({ error: 'Member not found' });

    if (req.user.role === 'frontdesk' && member.location_id !== req.user.location_id) {
      return res.status(403).json({ error: 'Access denied to this location' });
    }

    const currentMembership = await statsService.getActiveMembership(req.params.id);
    if (!currentMembership) return res.status(404).json({ error: 'No active membership found' });

    const newStart = start_date ? new Date(start_date) : new Date(currentMembership.end_date);
    const newEnd   = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + PLAN_DURATION[plan_type]);

    const membershipId = randomUUID();
    const paymentId    = randomUUID();
    const now          = new Date();
    const amount       = PLAN_AMOUNT[plan_type];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        "UPDATE memberships SET status = 'cancelled' WHERE id = $1",
        [currentMembership.id]
      );

      const { rows: [newMembership] } = await client.query(
        `INSERT INTO memberships (id, member_id, location_id, plan_type, start_date, end_date, status, member_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', 'renewal', $7)
         RETURNING id, member_id, location_id, plan_type, start_date, end_date, status, member_type`,
        [membershipId, req.params.id, member.location_id, plan_type, newStart, newEnd, now]
      );

      const { rows: [payment] } = await client.query(
        `INSERT INTO payments (id, member_id, membership_id, location_id, amount, payment_type, paid_at)
         VALUES ($1, $2, $3, $4, $5, 'renewal', NOW())
         RETURNING id, member_id, amount, payment_type, paid_at`,
        [paymentId, req.params.id, membershipId, member.location_id, amount]
      );

      await client.query('COMMIT');

      const todayTotal = await statsService.getTodayRevenue(member.location_id);
      broadcastPayment({
        location_id:  member.location_id,
        amount,
        plan_type,
        member_name:  member.name,
        today_total:  todayTotal,
      });

      return res.status(201).json({ membership: newMembership, payment });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[members] POST /:id/renew error:', err.message);
    return res.status(500).json({ error: 'Failed to renew membership' });
  }
});

module.exports = router;
