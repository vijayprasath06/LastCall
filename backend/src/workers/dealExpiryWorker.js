/**
 * Worker 1 — Deal Expiry Sweep [ARCH-3]
 *
 * Runs every 2 minutes via node-cron.
 * Finds all deals with expires_at < NOW() and status ACTIVE or PARTIALLY_CLAIMED.
 * Transitions them to EXPIRED.
 *
 * Also triggers NGO pre-check: deals expiring in 15 minutes with 0 claims
 * get status NGO_HANDOFF (handled separately by Worker 7).
 *
 * CRIT-3 FIX (RUS DECAY): RUS is recalculated within this sweep so consumers
 * always see GOING_NOW urgency in the final minutes — the sweep is faster than
 * Worker 3's 5-minute cycle for last-mile urgency.
 */

const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const sseManager = require('../sse/SSEManager');
const { calculateRUS } = require('../services/rusCalculator');

async function runExpiryWorker() {
  try {
    // 1. Expire deals past their TTL
    const expired = await db('deals')
      .where('expires_at', '<', new Date())
      .whereIn('status', ['ACTIVE', 'PARTIALLY_CLAIMED'])
      .update({ status: 'EXPIRED', updated_at: new Date() })
      .returning(['id', 'vendor_id', 'title', 'original_price', 'claimed_quantity', 'total_quantity']);

    for (const deal of expired) {
      console.log(`[Worker1] Expired deal: ${deal.id} (${deal.title})`);

      // Notify vendor SSE stream
      sseManager.sendToVendorDeal(deal.id, 'deal:expired', { deal_id: deal.id });

      // Record analytics
      await db('vendor_analytics').insert({
        id: uuidv4(),
        vendor_id: deal.vendor_id,
        deal_id: deal.id,
        deal_title_snapshot: deal.title,
        deal_price_snapshot: deal.original_price,
        event_type: 'deal_expired',
        items_rescued: deal.claimed_quantity,
      });

      // Also expire any CONFIRMED claims on these deals (become no-shows)
      const noShows = await db('claims')
        .where({ deal_id: deal.id, status: 'CONFIRMED' })
        .update({ status: 'EXPIRED', expired_at: new Date() })
        .returning(['user_id']);

      // ARCH-6: Increment no_show_count and recalculate reliability_score
      for (const { user_id } of noShows) {
        await db.raw(`
          UPDATE users SET
            no_show_count = no_show_count + 1,
            is_flagged = (no_show_count + 1) >= 3,
            reliability_score = successful_pickups::decimal / GREATEST(total_claims, 1)
          WHERE id = ?
        `, [user_id]);

        sseManager.sendToConsumer(user_id, 'claim:expired', { deal_id: deal.id });
      }
    }

    // 2. Pre-flag deals expiring in 15 minutes with 0 claims → NGO_HANDOFF
    const ngoHandoffs = await db('deals')
      .where('expires_at', '>', new Date())
      .where('expires_at', '<', db.raw("NOW() + INTERVAL '15 minutes'"))
      .where({ status: 'ACTIVE', claimed_quantity: 0 })
      .update({ status: 'NGO_HANDOFF', updated_at: new Date() })
      .returning(['id', 'vendor_id', 'title', 'original_price']);

    for (const deal of ngoHandoffs) {
      console.log(`[Worker1] NGO Handoff flagged: ${deal.id}`);
      await db('vendor_analytics').insert({
        id: uuidv4(),
        vendor_id: deal.vendor_id,
        deal_id: deal.id,
        deal_title_snapshot: deal.title,
        deal_price_snapshot: deal.original_price,
        event_type: 'deal_ngo_handoff',
      });
    }

  } catch (err) {
    console.error('[Worker1] Error:', err.message);
  }
}

// Schedule: every 2 minutes
cron.schedule('*/2 * * * *', runExpiryWorker);

console.log('✅ Worker 1 (Deal Expiry Sweep) started — runs every 2 minutes');

module.exports = { runExpiryWorker };
