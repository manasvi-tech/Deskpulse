/**
 * Simulator Job
 *
 * Thin wrapper that re-exports the materialized view refresh scheduler
 * (keeping app.js imports consistent with the jobs/ folder pattern from CLAUDE.md).
 *
 * Core simulation logic lives in services/simulatorService.js.
 * The cron schedule for MV refresh lives in jobs/anomalyDetector.js.
 * This file re-exports scheduleMVRefresh so app.js can import it from the
 * jobs layer without directly reaching into anomalyDetector.
 */

const { scheduleMVRefresh } = require('./anomalyDetector');

module.exports = { scheduleMVRefresh };
