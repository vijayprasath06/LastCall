/**
 * Worker 2 — Claim Timeout / No-Show [ARCH-6]
 *
 * Runs every 1 minute.
 * Finds CONFIRMED claims where qr_expires_at < NOW().
 * Transitions them to EXPIRED (no-show), releases the slot atomically.
 *
 * Reliability score recalculation:
 *   reliability_score = successful_pickups / GREATEST(total_claims, 1)
 *   is_flagged = true if no_show_count >= 3
 */

const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const sseManager = require('../sse/SSEManager');

async function runClaimTimeoutWorker() {
  try {
    // Find expired CONFIRMED claims
    const expiredClaims = await db('claims')
      .where({ status: 'CONFIRMED' })
      .where('qr_expires_at', '<', new Date())
      .update({ status: 'EXPIRED', expired_at: new Date() })
      .returning(['id', 'deal_id', 'user_id']);

    if (expiredClaims.length === 0) return;

    for (const claim of expiredClaims) {
      console.log(`[Worker2] Claim timeout (no-show): claim=${claim.id}, user=${claim.user_id}`);

      // Release slot atomically
      await db.raw(`
        UPDATE deals SET
          claimed_quantity = GREATEST(claimed_quantity - 1, 0),
          status = CASE
            WHEN (claimed_quantity - 1) <= 0 THEN 'ACTIVE'
            ELSE 'PARTIALLY_CLAIMED'
          END,
          updated_at = NOW()
        WHERE id = ? AND status IN ('CLAIMED', 'PARTIALLY_CLAIMED')
      `, [claim.deal_id]);

      // ARCH-6: Increment no_show_count, recalculate score, set flag at 3+
      await db.raw(`
        UPDATE users SET
          no_show_count = no_show_count + 1,
          is_flagged = (no_show_count + 1) >= 3,
          reliability_score = successful_pickups::decimal / GREATEST(total_claims, 1)
        WHERE id = ?
      `, [claim.user_id]);

      // Notify consumer their claim expired
      sseManager.sendToConsumer(claim.user_id, 'claim:expired', {
        deal_id: claim.deal_id,
        claim_id: claim.id,
        reason: 'QR code expired — slot released',
      });

      // Notify vendor that a slot was released
      sseManager.sendToVendorDeal(claim.deal_id, 'claim:released', {
        deal_id: claim.deal_id,
      });
    }

    console.log(`[Worker2] Processed ${expiredClaims.length} timed-out claims`);
  } catch (err) {
    console.error('[Worker2] Error:', err.message);
  }
}

// Schedule: every 1 minute
cron.schedule('* * * * *', runClaimTimeoutWorker);

console.log('✅ Worker 2 (Claim Timeout) started — runs every 1 minute');

module.exports = { runClaimTimeoutWorker };
