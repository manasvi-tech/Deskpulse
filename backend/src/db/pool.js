/**
 * PostgreSQL connection pool singleton.
 * Uses DATABASE_URL environment variable.
 * Import this module anywhere in the backend — always returns the same pool.
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep a small pool — backend is WebSocket-heavy, not request-heavy
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[pool] Unexpected error on idle PostgreSQL client:', err.message);
});

module.exports = pool;
