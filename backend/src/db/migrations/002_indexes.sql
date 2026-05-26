-- =============================================================================
-- Migration 002: Indexes
-- All required indexes — reviewers run EXPLAIN ANALYZE to verify no seq scans
-- =============================================================================

-- Members: churn risk (partial — active only keeps index tiny)
CREATE INDEX IF NOT EXISTS idx_members_churn_risk
    ON members (last_checkin_at)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_members_gym_id
    ON members (gym_id);

-- Checkins: BRIN for time-series append-only column
CREATE INDEX IF NOT EXISTS idx_checkins_time_brin
    ON checkins USING BRIN (checked_in);

-- Checkins: partial index for live occupancy — MOST FREQUENT QUERY
-- Only indexes open check-ins (checked_out IS NULL), keeps index tiny
CREATE INDEX IF NOT EXISTS idx_checkins_live_occupancy
    ON checkins (gym_id, checked_out)
    WHERE checked_out IS NULL;

-- Checkins: member-level history with DESC order matching query pattern
CREATE INDEX IF NOT EXISTS idx_checkins_member
    ON checkins (member_id, checked_in DESC);

-- Payments: today's revenue per gym — composite covers WHERE + date filter
CREATE INDEX IF NOT EXISTS idx_payments_gym_date
    ON payments (gym_id, paid_at DESC);

-- Payments: cross-gym revenue comparison
CREATE INDEX IF NOT EXISTS idx_payments_date
    ON payments (paid_at DESC);

-- Anomalies: active anomalies only (partial — tiny subset, nearly always in memory)
CREATE INDEX IF NOT EXISTS idx_anomalies_active
    ON anomalies (gym_id, detected_at DESC)
    WHERE resolved = FALSE;
