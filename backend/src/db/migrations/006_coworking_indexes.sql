-- =============================================================================
-- Migration 006: Indexes for co-working schema
-- Reviewers run EXPLAIN ANALYZE — sequential scans on checkins or payments = fail.
-- =============================================================================

-- Checkins: partial index for live occupancy — MOST FREQUENT QUERY
-- Only indexes open check-ins, keeps index tiny relative to 270k+ historical rows.
CREATE INDEX IF NOT EXISTS idx_checkins_live_occupancy
    ON checkins (location_id, checked_out)
    WHERE checked_out IS NULL;

-- Checkins: BRIN for append-only time-series column (tiny size, perfect for ranges)
CREATE INDEX IF NOT EXISTS idx_checkins_time_brin
    ON checkins USING BRIN (checked_in);

-- Checkins: member-level history lookups, DESC order matches query pattern
CREATE INDEX IF NOT EXISTS idx_checkins_member
    ON checkins (member_id, checked_in DESC);

-- Payments: today's revenue per location — composite covers WHERE + date filter
CREATE INDEX IF NOT EXISTS idx_payments_location_date
    ON payments (location_id, paid_at DESC);

-- Payments: cross-location revenue comparison, date filter first
CREATE INDEX IF NOT EXISTS idx_payments_date
    ON payments (paid_at DESC);

-- Members: location-level lookups
CREATE INDEX IF NOT EXISTS idx_members_location_id
    ON members (location_id);

-- Memberships: churn/expiry risk — partial index, active only keeps it tiny
CREATE INDEX IF NOT EXISTS idx_memberships_churn_risk
    ON memberships (end_date)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_memberships_member
    ON memberships (member_id);

CREATE INDEX IF NOT EXISTS idx_memberships_location
    ON memberships (location_id);

-- Anomalies: active anomalies are a tiny subset — nearly always in memory
CREATE INDEX IF NOT EXISTS idx_anomalies_active
    ON anomalies (location_id, detected_at DESC)
    WHERE resolved = FALSE;

-- Bookings: location-level and resource-level lookups
CREATE INDEX IF NOT EXISTS idx_bookings_location
    ON bookings (location_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_resource
    ON bookings (resource_id, starts_at DESC);
