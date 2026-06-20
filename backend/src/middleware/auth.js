'use strict';

const jwt  = require('jsonwebtoken');
const pool = require('../db/pool');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      'SELECT id, name, email, role, location_id, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!result.rows[0] || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// Checks that frontdesk users only access their own location.
// Reads location id from req.params.id, req.params.locationId, req.body, or req.query.
const requireLocation = (req, res, next) => {
  if (req.user.role === 'super_admin') return next();

  const locationId =
    req.params.id ||
    req.params.locationId ||
    req.body?.location_id ||
    req.query?.location_id;

  if (locationId && locationId !== req.user.location_id) {
    return res.status(403).json({ error: 'Access denied to this location' });
  }
  next();
};

module.exports = { authMiddleware, requireRole, requireLocation };
