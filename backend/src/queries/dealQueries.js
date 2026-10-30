/**
 * Deal Queries — Reusable PostgreSQL helpers [Phase 5]
 *
 * Supplements geospatialQueries.js with deal-specific fetches
 * used by workers, controllers, and the RUS recalculator.
 *
 * All queries use the shared Knex connection from config/db.js.
 */

const db = require('../config/db');

// ─── Active deals eligible for Dutch Auction price drops ─────────────────────

/**
 * Returns deals whose next_price_drop_at ≤ NOW() and have not yet
 * reached their minimum rescue price.
 * Used by Worker 6 (priceDroppingWorker).
 * @returns {Promise<Array>}
 */
async function getDealsReadyForPriceDrop() {
  return db('deals')
    .whereIn('status', ['ACTIVE', 'PARTIALLY_CLAIMED'])
    .where('next_price_drop_at', '<=', new Date())
    .whereRaw('current_price > min_rescue_price')
    .select([
      'id', 'vendor_id', 'title',
      'current_price', 'min_rescue_price', 'start_price', 'original_price',
      'next_price_drop_at', 'expires_at',
      'urgency_score', 'urgency_label',
    ]);
}

// ─── Active deals expiring in next 15 minutes with 0 claims ──────────────────

/**
 * Finds ACTIVE deals within T-15 min of expiry that have zero claims.
 * Used by Worker 7 (ngoHandoffWorker) before marking NGO_HANDOFF.
 * @returns {Promise<Array>}
 */
async function getDealsForNgoHandoff() {
  return db('deals')
    .where({ status: 'ACTIVE', claimed_quantity: 0 })
    .where('expires_at', '>', new Date())
    .where('expires_at', '<', db.raw("NOW() + INTERVAL '15 minutes'"))
    .select([
      'id', 'vendor_id', 'title',
      'current_price', 'original_price',
      'expires_at', 'items',
    ]);
}

// ─── Active deals for RUS recalculation ──────────────────────────────────────

/**
 * Returns all deals currently ACTIVE or PARTIALLY_CLAIMED — used by Worker 3
 * to batch-recalculate urgency scores every 5 minutes.
 * @returns {Promise<Array>}
 */
async function getActiveDealsForRUSUpdate() {
  return db.raw(`
    SELECT
      d.id,
      d.vendor_id,
      d.title,
      d.current_price,
      d.total_quantity,
      d.claimed_quantity,
      d.expires_at,
      d.urgency_score,
      d.urgency_label,
      EXTRACT(EPOCH FROM (d.expires_at - NOW())) / 60 AS minutes_remaining,
      (d.total_quantity - d.claimed_quantity) AS items_remaining,
      v.avg_claim_lag_secs,
      v.city
    FROM deals d
    JOIN vendors v ON d.vendor_id = v.id
    WHERE d.status IN ('ACTIVE', 'PARTIALLY_CLAIMED')
      AND d.expires_at > NOW()
  `).then((r) => r.rows);
}

// ─── Get a single deal with full vendor context ───────────────────────────────

/**
 * Fetches a deal record with joined vendor metadata.
 * Used by controllers and workers needing full context.
 * @param {string} dealId
 * @returns {Promise<object|null>}
 */
async function getDealWithVendor(dealId) {
  const result = await db.raw(`
    SELECT
      d.*,
      ST_X(d.deal_location::geometry) AS deal_lng,
      ST_Y(d.deal_location::geometry) AS deal_lat,
      v.business_name AS vendor_name,
      v.city AS vendor_city,
      v.avg_claim_lag_secs,
      v.city_density_tier
    FROM deals d
    JOIN vendors v ON d.vendor_id = v.id
    WHERE d.id = ?
  `, [dealId]);
  return result.rows[0] ?? null;
}

// ─── Get confirmed claims on a deal — used by NGO handoff check ──────────────

/**
 * Returns count of CONFIRMED claims for a deal.
 * @param {string} dealId
 * @returns {Promise<number>}
 */
async function getConfirmedClaimCount(dealId) {
  const row = await db('claims')
    .where({ deal_id: dealId, status: 'CONFIRMED' })
    .count('id as count')
    .first();
  return parseInt(row.count, 10);
}

// ─── Get NGO recipients from admin allowlist ──────────────────────────────────

/**
 * Fetches verified NGO partners from the admin allowlist.
 * Only DPA-approved NGOs receive Worker 7 webhook payloads [CRIT-3].
 * @returns {Promise<Array<{ id, name, webhook_url, contact_email }>>}
 */
async function getApprovedNGOs() {
  return db('ngo_partners')
    .where({ is_approved: true, is_active: true })
    .select(['id', 'name', 'webhook_url', 'contact_email']);
}

module.exports = {
  getDealsReadyForPriceDrop,
  getDealsForNgoHandoff,
  getActiveDealsForRUSUpdate,
  getDealWithVendor,
  getConfirmedClaimCount,
  getApprovedNGOs,
};
