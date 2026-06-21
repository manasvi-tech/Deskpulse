'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const pool     = require('../db/pool');
const logger   = require('../utils/logger');
const { validate }     = require('../middleware/validate');
const { loginSchema }  = require('../schemas');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, name, email, role, location_id, password_hash, is_active FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];

    // Never distinguish "not found" vs "wrong password" in the error message
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, location_id: user.location_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '3d' }
    );

    // COOKIE_SECURE=true only in environments with HTTPS termination.
    // Docker local dev uses HTTP, so we default to false even when NODE_ENV=production.
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: 3 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      user: {
        id:          user.id,
        name:        user.name,
        email:       user.email,
        role:        user.role,
        location_id: user.location_id,
      },
    });
  } catch (err) {
    logger.error({ err: err.message }, '[auth] POST /login error');
    return res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.location_id, l.name AS location_name
       FROM users u
       LEFT JOIN locations l ON u.location_id = l.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    const u = result.rows[0];
    if (!u) return res.status(401).json({ error: 'User not found' });
    return res.json({
      user: {
        id:            u.id,
        name:          u.name,
        email:         u.email,
        role:          u.role,
        location_id:   u.location_id,
        location_name: u.location_name || null,
      },
    });
  } catch (err) {
    logger.error({ err: err.message }, '[auth] GET /me error');
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
