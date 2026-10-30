/**
 * Worker 3 — RUS (Real-Time Urgency Score) Recalculator
 *
 * Runs every 5 minutes.
 * Recalculates urgency_score and urgency_label for all ACTIVE and PARTIALLY_CLAIMED deals.
 * Pushes deal:update SSE events to currently-connected consumers with personalized scores.
 *
 * PROD-2 FIX: Weather is fetched per vendor city via cached weatherService.
 */

const cron = require('node-cron');
const { differenceInMinutes } = require('date-fns');
const db = require('../config/db');
const { calculateRUS } = require('../services/rusCalculator');
const { getWeatherCondition } = require('../services/weatherService');
const sseManager = require('../sse/SSEManager');

async function runRUSWorker() {
  try {
    const activeDeals = await db('deals')
      .join('vendors', 'deals.vendor_id', 'vendors.id')
      .whereIn('deals.status', ['ACTIVE', 'PARTIALLY_CLAIMED'])
      .where('deals.expires_at', '>', new Date())
      .select([
        'deals.id', 'deals.expires_at', 'deals.total_quantity', 'deals.claimed_quantity',
        'vendors.avg_claim_lag_secs', 'vendors.city',
      ]);

    if (activeDeals.length === 0) return;

    for (const deal of activeDeals) {
      const minutesRemaining = differenceInMinutes(new Date(deal.expires_at), new Date());
      const itemsRemaining = deal.total_quantity - deal.claimed_quantity;
      const weatherCondition = await getWeatherCondition(deal.city || 'Chennai');

      const { score, label } = calculateRUS({
        minutesRemaining,
        itemsRemaining,
        avgClaimLagSecs: deal.avg_claim_lag_secs,
        weatherCondition,
      });

      await db('deals').where({ id: deal.id }).update({
        urgency_score: score,
        urgency_label: label,
        rus_updated_at: new Date(),
        updated_at: new Date(),
      });

      // Broadcast update to SSE-connected consumers watching this deal area
      sseManager.broadcastToAllConsumers('deal:update', {
        deal_id: deal.id,
        urgency_score: score,
        urgency_label: label,
        items_remaining: itemsRemaining,
        minutes_remaining: minutesRemaining,
      });
    }

    console.log(`[Worker3] RUS updated for ${activeDeals.length} deals`);
  } catch (err) {
    console.error('[Worker3] Error:', err.message);
  }
}

// Schedule: every 5 minutes
cron.schedule('*/5 * * * *', runRUSWorker);

console.log('✅ Worker 3 (RUS Recalculator) started — runs every 5 minutes');

module.exports = { runRUSWorker };
