/**
 * Anomaly Detector Job
 *
 * Runs every 30 seconds using node-cron.
 * On startup it fires immediately so anomalies are visible within seconds
 * of `docker compose up`.
 *
 * Also schedules the location_hourly_stats materialized view refresh (every 15 min).
 */

const cron                   = require('node-cron');
const { detectAllAnomalies } = require('../services/anomalyService');
const pool                   = require('../db/pool');
const logger                 = require('../utils/logger');

let detectorTask = null;
let mvTask       = null;

// ── Anomaly detection (every 30 seconds) ─────────────────────────────────────
function startAnomalyDetector() {
  if (detectorTask) detectorTask.stop();

  // node-cron pattern: second minute hour dayOfMonth month dayOfWeek
  // '*/30 * * * * *' = every 30 seconds
  detectorTask = cron.schedule('*/30 * * * * *', async () => {
    try {
      await detectAllAnomalies();
    } catch (err) {
      logger.error({ err: err.message }, '[anomalyDetector] Cron error');
    }
  });

  logger.info('[anomalyDetector] Started — running every 30 seconds');

  // Run once immediately so anomalies are populated before first client connects
  detectAllAnomalies().catch((err) => {
    logger.error({ err: err.message }, '[anomalyDetector] Initial run error');
  });
}

function stopAnomalyDetector() {
  if (detectorTask) {
    detectorTask.stop();
    detectorTask = null;
  }
}

// ── Materialized view refresh (every 15 minutes) ──────────────────────────────
function scheduleMVRefresh() {
  if (mvTask) mvTask.stop();

  // '*/15 * * * *' = every 15 minutes
  mvTask = cron.schedule('*/15 * * * *', async () => {
    try {
      await pool.query(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY location_hourly_stats'
      );
      logger.info('[mv] location_hourly_stats refreshed');
    } catch (err) {
      logger.error({ err: err.message }, '[mv] Refresh error');
    }
  });

  logger.info('[mv] location_hourly_stats refresh scheduled — every 15 minutes');
}

module.exports = { startAnomalyDetector, stopAnomalyDetector, scheduleMVRefresh };
