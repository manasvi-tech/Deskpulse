-- =============================================================================
-- Migration 005: Co-working schema
-- Tables in FK-safe insertion order:
--   locations → resources → companies → members → memberships
--   → payments → checkins → bookings → anomalies
-- =============================================================================

-- locations -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT NOT NULL,
    city                  TEXT NOT NULL,
    address               TEXT,
    total_hot_desks       INTEGER NOT NULL DEFAULT 0,
    total_dedicated_desks INTEGER NOT NULL DEFAULT 0,
    total_private_offices INTEGER NOT NULL DEFAULT 0,
    total_meeting_rooms   INTEGER NOT NULL DEFAULT 0,
    opens_at              TIME NOT NULL DEFAULT '08:00',
    closes_at             TIME NOT NULL DEFAULT '22:00',
    status                TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- resources -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resources (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('hot_desk','dedicated_desk','private_office','meeting_room')),
    name        TEXT NOT NULL,
    capacity    INTEGER NOT NULL DEFAULT 1,
    status      TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','maintenance'))
);

-- companies -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    contact_name  TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    location_id   UUID REFERENCES locations(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- members ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    phone       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'frozen')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- memberships -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memberships (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    plan_type   TEXT NOT NULL CHECK (plan_type IN ('day_pass','hot_desk','dedicated_desk','private_office')),
    start_date  TIMESTAMPTZ NOT NULL,
    end_date    TIMESTAMPTZ NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','expired','cancelled','paused')),
    member_type TEXT NOT NULL DEFAULT 'new' CHECK (member_type IN ('new','renewal')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- payments --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    location_id   UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    amount        NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_type  TEXT NOT NULL DEFAULT 'new' CHECK (payment_type IN ('new','renewal')),
    paid_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes         TEXT
);

-- checkins --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkins (
    id           BIGSERIAL PRIMARY KEY,
    member_id    UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    location_id  UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    checked_in   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checked_out  TIMESTAMPTZ,
    duration_min INTEGER GENERATED ALWAYS AS (
        CASE
            WHEN checked_out IS NOT NULL
            THEN EXTRACT(EPOCH FROM (checked_out - checked_in))::INTEGER / 60
            ELSE NULL
        END
    ) STORED
);

-- bookings --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    starts_at   TIMESTAMPTZ NOT NULL,
    ends_at     TIMESTAMPTZ NOT NULL,
    status      TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed','cancelled','no_show')),
    amount      NUMERIC(10, 2),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- anomalies -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anomalies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('no_activity','overbooking','revenue_drop','high_no_show')),
    severity    TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
    message     TEXT NOT NULL,
    resolved    BOOLEAN NOT NULL DEFAULT FALSE,
    dismissed   BOOLEAN NOT NULL DEFAULT FALSE,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
