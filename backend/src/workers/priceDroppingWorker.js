/**
 * Worker 6 — Dutch Auction Price Dropper [COMP-6]
 *
 * Runs every 1 minute to check for deals whose next_price_drop_at ≤ NOW().
 * Decreases current_price linearly toward min_rescue_price.
 * Emits deal:price_drop SSE event to all connected consumers in the deal's radius.
 *
 * Price drop algorithm (linear interpolation):
 *   time_window = expires_at - posted_at               (total deal lifetime)
 *   elapsed     = NOW() - posted_at
 *   progress    = elapsed / time_window                 (0.0 → 1.0)
 *   new_price   = start_price - (progress * (start_price - min_rescue_price))
 *   new_price   = CLAMP(new_price, min_rescue_price, start_price)
 *
 * next_price_drop_at is reset to NOW() + drop_interval_minutes
 * (stored in deals.drop_interval_minutes; defaults to 10 min).
 *
 * Emits:
 *   deal:price_drop → consumer SSE via fanOutDealNotification (non-SSE users → FCM)
 */

const cron = require('node-cron');
const db = require('../config/db');
const sseManager = require('../sse/SSEManager');
const { getDealsReadyForPriceDrop } = require('../queries/dealQueries');
const { fanOutPriceDropNotification } = require('../services/pushService');
const events = require('../sse/sseEvents');

/**
 * Compute the next linear price for a deal.
 * @param {object} deal
 * @returns {number} new price (clamped to min_rescue_price)
 */
function computeLinearPriceDrop(deal) {
  const now = Date.now();
  const postedAt = new Date(deal.posted_at).getTime();
  const expiresAt = new Date(deal.expires_at).getTime();

  const totalWindow = expiresAt - postedAt;
  if (totalWindow <= 0) return parseFloat(deal.min_rescue_price);

  const elapsed = now - postedAt;
  const progress = Math.min(1, Math.max(0, elapsed / totalWindow));

  const priceRange = parseFloat(deal.start_price) - parseFloat(deal.min_rescue_price);
  const newPrice = parseFloat(deal.start_price) - (progress * priceRange);

  // Clamp: never go below min_rescue_price
  return Math.max(parseFloat(deal.min_rescue_price), parseFloat(newPrice.toFixed(2)));
}

async function runPriceDroppingWorker() {
  try {
    const deals = await getDealsReadyForPriceDrop();

    if (deals.length === 0) return;

    for (const deal of deals) {
      const oldPrice = parseFloat(deal.current_price);
      const newPrice = computeLinearPriceDrop(deal);

      // Skip if no meaningful change
      if (newPrice >= oldPrice) continue;

      // Drop interval: use deal column or default 10 min
      const dropIntervalMins = deal.drop_interval_minutes || 10;
      const nextDrop = new Date(Date.now() + dropIntervalMins * 60 * 1000);

      await db('deals').where({ id: deal.id }).update({
        current_price: newPrice,
        next_price_drop_at: nextDrop,
        updated_at: new Date(),
      });

      console.log(`[Worker6] Price drop: deal=${deal.id} ${oldPrice} → ${newPrice} (min: ${deal.min_rescue_price})`);

      // Build SSE payload
      const payload = events.dealPriceDrop({
        dealId: deal.id,
        dealTitle: deal.title,
        oldPrice,
        newPrice,
        minRescuePrice: parseFloat(deal.min_rescue_price),
        urgencyLabel: deal.urgency_label,
        expiresAt: deal.expires_at,
      });

      // Notify vendor's deal stream
      sseManager.sendToVendorDeal(deal.id, payload.event, payload.data);

      // Fan out to nearby consumers (SSE if connected, else FCM)
      fanOutPriceDropNotification(deal.id, payload.data)
        .catch((err) => console.error(`[Worker6] Fan-out error for deal ${deal.id}:`, err.message));
    }

    console.log(`[Worker6] Processed ${deals.length} price drop(s)`);
  } catch (err) {
    console.error('[Worker6] Error:', err.message);
  }
}

// Schedule: every 1 minute
cron.schedule('* * * * *', runPriceDroppingWorker);

console.log('✅ Worker 6 (Dutch Auction Price Dropper) started — runs every 1 minute');

module.exports = { runPriceDroppingWorker, computeLinearPriceDrop };
