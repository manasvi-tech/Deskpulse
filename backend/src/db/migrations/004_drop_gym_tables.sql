-- =============================================================================
-- Migration 004: Drop gym-era tables and materialized view
-- Order respects foreign key constraints (most-dependent first).
-- =============================================================================

DROP TABLE IF EXISTS anomalies CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS checkins CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS gyms CASCADE;
DROP MATERIALIZED VIEW IF EXISTS gym_hourly_stats;
