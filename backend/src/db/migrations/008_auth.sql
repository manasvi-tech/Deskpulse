-- 008_auth.sql — User authentication table
-- location_id is NULL for super_admin (access to all locations)
-- location_id is required for frontdesk (locked to one location)

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('super_admin', 'frontdesk')),
  location_id   UUID        REFERENCES locations(id) ON DELETE SET NULL,
  name          TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_location ON users (location_id) WHERE role = 'frontdesk';
CREATE INDEX IF NOT EXISTS idx_users_role     ON users (role);
