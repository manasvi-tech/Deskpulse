'use strict';

const express      = require('express');
const router       = express.Router();
const logger       = require('../utils/logger');
const { validate } = require('../middleware/validate');
const { userSchema } = require('../schemas');
const { authMiddleware, requireRole } = require('../middleware/auth');
const usersService = require('../services/usersService');

// All routes require authentication and super_admin role
router.use(authMiddleware, requireRole('super_admin'));

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const users = await usersService.getAllUsers();
    return res.json({ users });
  } catch (err) {
    logger.error({ err: err.message }, '[users] GET / error');
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users
router.post('/', validate(userSchema), async (req, res) => {
  try {
    const { name, email, password, role, location_id } = req.body;

    if (!['super_admin', 'frontdesk'].includes(role)) {
      return res.status(400).json({ error: 'role must be super_admin or frontdesk' });
    }
    if (role === 'frontdesk' && !location_id) {
      return res.status(400).json({ error: 'location_id is required for frontdesk role' });
    }

    const user = await usersService.createUser({ name, email, password, role, location_id });
    return res.status(201).json({ user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    logger.error({ err: err.message }, '[users] POST / error');
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH /api/users/:id
router.patch('/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot modify your own account' });
    }

    const { name, role, location_id, is_active } = req.body;
    const user = await usersService.updateUser(req.params.id, { name, role, location_id, is_active });

    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user });
  } catch (err) {
    logger.error({ err: err.message }, '[users] PATCH /:id error');
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id — soft delete only
router.delete('/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await usersService.deactivateUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message }, '[users] DELETE /:id error');
    return res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

module.exports = router;
