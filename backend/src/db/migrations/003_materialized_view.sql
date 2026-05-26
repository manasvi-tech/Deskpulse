-- =============================================================================
-- Migration 003: Materialized View — gym_hourly_stats
-- Pre-aggregates check-in counts by gym + day-of-week + hour-of-day
-- Refreshed every 15 minutes via background job
-- CONCURRENT refresh requires unique index (created below)
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS gym_hourly_stats AS
    SELECT
        gym_id,
        EXTRACT(DOW FROM checked_in)::INTEGER  AS day_of_week,
        EXTRACT(HOUR FROM checked_in)::INTEGER AS hour_of_day,
        COUNT(*)                                AS checkin_count
    FROM checkins
    WHERE checked_in >= NOW() - INTERVAL '7 days'
    GROUP BY gym_id, day_of_week, hour_of_day;

-- Unique index required for CONCURRENT refresh and makes heatmap lookups instant
CREATE UNIQUE INDEX IF NOT EXISTS gym_hourly_stats_unique
    ON gym_hourly_stats (gym_id, day_of_week, hour_of_day);
