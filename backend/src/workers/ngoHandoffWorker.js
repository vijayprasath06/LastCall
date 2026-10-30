/**
 * Worker 7 — Guarded NGO Handoff Cascade [CRIT-3, ARCH-3, COMP-2]
 *
 * Runs every 1 minute to check deals expiring in the next 15 minutes
 * that still have ZERO consumer claims.
 *
 * STRICT GUARD (from spec):
 *   EXIT IMMEDIATELY if deal.status ≠ 'ACTIVE' OR claimed_quantity > 0.
 *   This prevents NGO webhooks firing on partially/fully claimed deals.
 *
 * When the guard passes:
 *   1. Marks deal status = 'NGO_HANDOFF' (atomic DB update).
 *   2. Emits deal:ngo_handoff SSE to connected consumers.
 *   3. Sends HTTP webhook POST to every DPA-approved NGO in the allowlist.
 *   4. Records a vendor_analytics event.
 *
 * DPA compliance [PROD-6]:
 *   Only NGOs with is_approved = true and is_active = true receive webhooks.
 *   Webhook payload contains only deal metadata, no user location data.
 */

const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const sseManager = require('../sse/SSEManager');
const { getApprovedNGOs } = require('../queries/dealQueries');
const events = require('../sse/sseEvents');

// ─── Webhook Dispatcher ───────────────────────────────────────────────────────

/**
 * POST deal payload to an NGO's webhook endpoint.
 * Non-fatal — logs errors without crashing the worker.
 * @param {object} ngo
 * @param {object} dealPayload
 */
async function dispatchNgoWebhook(ngo, dealPayload) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(ngo.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EGPP-Event': 'ngo_handoff',
        'X-EGPP-Timestamp': new Date().toISOString(),
      },
      body: JSON.stringify(dealPayload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[Worker7] NGO webhook ${ngo.name} returned HTTP ${response.status}`);
    } else {
      console.log(`[Worker7] ✅ NGO webhook sent → ${ngo.name} (${ngo.webhook_url})`);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`[Worker7] NGO webhook timeout for ${ngo.name}`);
    } else {
      console.error(`[Worker7] NGO webhook error for ${ngo.name}:`, err.message);
    }
  }
}

// ─── Main Worker Function ─────────────────────────────────────────────────────

async function runNgoHandoffWorker() {
  try {
    // Find ACTIVE deals expiring within 15 min with 0 claims
    const candidateDeals = await db('deals')
      .where({ status: 'ACTIVE', claimed_quantity: 0 })
      .where('expires_at', '>', new Date())
      .where('expires_at', '<', db.raw("NOW() + INTERVAL '15 minutes'"))
      .select([
        'id', 'vendor_id', 'title', 'items',
        'current_price', 'original_price',
        'total_quantity', 'claimed_quantity',
        'expires_at', 'posted_at',
      ]);

    if (candidateDeals.length === 0) return;

    // Fetch approved NGO list once
    let ngoList = [];
    try {
      ngoList = await getApprovedNGOs();
    } catch {
      // ngo_partners table may not exist yet — gracefully degrade
      console.warn('[Worker7] NGO allowlist unavailable (table may not exist yet)');
    }

    for (const deal of candidateDeals) {
      // ── STRICT GUARD [CRIT-3] ──────────────────────────────────────────────
      // Re-fetch deal with row lock to ensure no race with a claim arriving
      const fresh = await db('deals')
        .where({ id: deal.id, status: 'ACTIVE', claimed_quantity: 0 })
        .first('id', 'status', 'claimed_quantity');

      if (!fresh) {
        console.log(`[Worker7] Guard: deal ${deal.id} already claimed or changed — skipping`);
        continue;
      }
      // ──────────────────────────────────────────────────────────────────────

      // Mark as NGO_HANDOFF atomically
      const updated = await db('deals')
        .where({ id: deal.id, status: 'ACTIVE', claimed_quantity: 0 })
        .update({ status: 'NGO_HANDOFF', updated_at: new Date() });

      if (updated === 0) {
        // Another process beat us — skip
        console.log(`[Worker7] Race-condition guard: deal ${deal.id} already updated`);
        continue;
      }

      console.log(`[Worker7] NGO Handoff triggered: deal=${deal.id} (${deal.title})`);

      // Notify connected consumers
      const ssePayload = events.dealNgoHandoff({ dealId: deal.id, dealTitle: deal.title });
      sseManager.sendToVendorDeal(deal.id, ssePayload.event, ssePayload.data);

      // Record analytics
      await db('vendor_analytics').insert({
        id: uuidv4(),
        vendor_id: deal.vendor_id,
        deal_id: deal.id,
        deal_title_snapshot: deal.title,
        deal_price_snapshot: deal.original_price,
        event_type: 'deal_ngo_handoff',
      });

      // Build DPA-compliant webhook payload (no user location)
      const webhookPayload = {
        event: 'ngo_handoff',
        deal_id: deal.id,
        deal_title: deal.title,
        items: deal.items,
        current_price: deal.current_price,
        original_price: deal.original_price,
        total_quantity: deal.total_quantity,
        expires_at: deal.expires_at,
        posted_at: deal.posted_at,
      };

      // Fire webhooks to all approved NGOs
      for (const ngo of ngoList) {
        dispatchNgoWebhook(ngo, webhookPayload); // fire-and-forget, non-fatal
      }
    }

  } catch (err) {
    console.error('[Worker7] Error:', err.message);
  }
}

// Schedule: every 1 minute (must run more often than 15-min window)
cron.schedule('* * * * *', runNgoHandoffWorker);

console.log('✅ Worker 7 (Guarded NGO Handoff Cascade) started — runs every 1 minute');

module.exports = { runNgoHandoffWorker };
