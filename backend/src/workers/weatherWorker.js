/**
 * Worker 5 — Weather Cache Refresh
 *
 * Runs every 30 minutes.
 * Fetches distinct cities of all active vendors and refreshes
 * OpenWeatherMap data in Redis (35-min TTL).
 */

const cron = require('node-cron');
const db = require('../config/db');
const { refreshWeatherForCities } = require('../services/weatherService');

async function runWeatherWorker() {
  try {
    const rows = await db('vendors')
      .where({ is_verified: true })
      .distinct('city')
      .whereNotNull('city')
      .select('city');

    const cities = rows.map((r) => r.city).filter(Boolean);
    if (cities.length === 0) return;

    await refreshWeatherForCities(cities);
  } catch (err) {
    console.error('[Worker5] Error:', err.message);
  }
}

cron.schedule('*/30 * * * *', runWeatherWorker);
console.log('✅ Worker 5 (Weather Cache Refresh) started — runs every 30 minutes');

module.exports = { runWeatherWorker };
