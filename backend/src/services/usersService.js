'use strict';

const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const pool   = require('../db/pool');

const SALT_ROUNDS = 12;

async function getAllUsers() {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.location_id,
            l.name AS location_name
     FROM users u
     LEFT JOIN locations l ON u.location_id = l.id
     ORDER BY u.role, u.name`
  );
  return rows;
}

async function createUser({ name, email, password, role, location_id }) {
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const now = new Date();

  const { rows } = await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role, location_id, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7, $7)
     RETURNING id, name, email, role, location_id, is_active, created_at`,
    [randomUUID(), name, email.toLowerCase().trim(), password_hash, role, location_id || null, now]
  );
  return rows[0];
}

async function updateUser(id, { name, role, location_id, is_active }) {
  const sets = [];
  const vals = [];
  let i = 1;

  if (name        !== undefined) { sets.push(`name = $${i++}`);        vals.push(name); }
  if (role        !== undefined) { sets.push(`role = $${i++}`);        vals.push(role); }
  if (location_id !== undefined) { sets.push(`location_id = $${i++}`); vals.push(location_id); }
  if (is_active   !== undefined) { sets.push(`is_active = $${i++}`);   vals.push(is_active); }

  if (!sets.length) return null;

  sets.push(`updated_at = $${i++}`);
  vals.push(new Date());
  vals.push(id);

  const { rows } = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
     RETURNING id, name, email, role, location_id, is_active, created_at`,
    vals
  );
  return rows[0] || null;
}

async function deactivateUser(id) {
  const { rows } = await pool.query(
    `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1
     RETURNING id`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { getAllUsers, createUser, updateUser, deactivateUser };
