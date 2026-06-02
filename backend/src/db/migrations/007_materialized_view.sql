-- =============================================================================
-- Migration 007: Materialized View — location_hourly_stats
-- Pre-aggregates check-in counts by location + day-of-week + hour-of-day.
-- Refreshed every 15 minutes via background job (CONCURRENTLY requires unique index).
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS location_hourly_stats AS
    SELECT
        location_id,
        EXTRACT(DOW  FROM checked_in)::INTEGER AS day_of_week,
        EXTRACT(HOUR FROM checked_in)::INTEGER AS hour_of_day,
        COUNT(*)                               AS checkin_count
    FROM checkins
    WHERE checked_in >= NOW() - INTERVAL '7 days'
    GROUP BY location_id, day_of_week, hour_of_day;

-- Unique index enables CONCURRENT refresh and makes heatmap lookups instant.
CREATE UNIQUE INDEX IF NOT EXISTS location_hourly_stats_unique
    ON location_hourly_stats (location_id, day_of_week, hour_of_day);
