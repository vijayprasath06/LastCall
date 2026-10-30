/**
 * Vendor Controller — Phase 5
 *
 * GET    /api/vendor/me           — get own vendor profile
 * GET    /api/vendor/deals        — get own deals with claim counts
 * GET    /api/vendor/analytics    — get analytics time series
 * GET    /api/vendor/geocode      — address → GPS (Nominatim)
 * POST   /api/vendor/pickup/:qr   — verify QR token and confirm pickup [ARCH-6]
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const sseManager = require('../sse/SSEManager');
const { geocodeHandler } = require('../services/geocodingService');

// ─── GET /api/vendor/me ───────────────────────────────────────────────────────

async function getVendorProfile(req, res, next) {
  try {
    const vendor = await db.raw(`
      SELECT
        v.*,
        ST_X(v.verified_location::geometry) AS lng,
        ST_Y(v.verified_location::geometry) AS lat
      FROM vendors v
      WHERE v.id = ?
    `, [req.user.vendorId]);

    if (!vendor.rows.length) return res.status(404).json({ error: 'Vendor not found' });
    return res.status(200).json({ vendor: vendor.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/vendor/deals ────────────────────────────────────────────────────

async function getVendorDeals(req, res, next) {
  try {
    const deals = await db('deals')
      .where({ vendor_id: req.user.vendorId })
      .select([
        'id', 'title', 'status', 'total_quantity',
        'claimed_quantity', 'current_price', 'expires_at',
        'urgency_score', 'urgency_label', 'posted_at', 'image_url',
      ])
      .orderBy('posted_at', 'desc')
      .limit(50);

    return res.status(200).json({ deals });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/vendor/analytics ────────────────────────────────────────────────

async function getVendorAnalytics(req, res, next) {
  try {
    const { days = 30 } = req.query;

    const analytics = await db('vendor_analytics')
      .where({ vendor_id: req.user.vendorId })
      .where('recorded_at', '>', db.raw(`NOW() - INTERVAL '${parseInt(days)} days'`))
      .select(['event_type', 'items_rescued', 'revenue_amount', 'users_notified', 'claim_lag_secs', 'recorded_at'])
      .orderBy('recorded_at', 'desc')
      .limit(200);

    // Summary aggregates
    const summary = await db('vendor_analytics')
      .where({ vendor_id: req.user.vendorId })
      .select(
        db.raw('SUM(items_rescued) AS total_items_rescued'),
        db.raw('SUM(revenue_amount) AS total_revenue'),
        db.raw('AVG(claim_lag_secs) AS avg_claim_lag_secs'),
      )
      .first();

    return res.status(200).json({ analytics, summary });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/vendor/pickup/:qrToken ─────────────────────────────────────────

/**
 * Vendor scans consumer's QR code at pickup time.
 * Marks claim as PICKED_UP and updates consumer reliability score [ARCH-6].
 * Also updates vendor analytics (items_rescued, revenue).
 */
async function confirmPickup(req, res, next) {
  try {
    const { qrToken } = req.params;
    const vendorId = req.user.vendorId;

    // Find the claim by QR token
    const claim = await db('claims')
      .join('deals', 'claims.deal_id', 'deals.id')
      .where('claims.qr_token', qrToken)
      .where('claims.status', 'CONFIRMED')
      .where('claims.qr_expires_at', '>', new Date())
      .select([
        'claims.id AS claim_id', 'claims.user_id', 'claims.deal_id',
        'deals.vendor_id', 'deals.current_price', 'deals.total_quantity',
        'deals.claimed_quantity', 'deals.title AS deal_title', 'deals.original_price',
      ])
      .first();

    if (!claim) {
      return res.status(404).json({ error: 'QR code is invalid, expired, or already used', code: 'QR_INVALID' });
    }

    if (claim.vendor_id !== vendorId) {
      return res.status(403).json({ error: 'This QR belongs to a different vendor', code: 'QR_VENDOR_MISMATCH' });
    }

    // Mark claim as PICKED_UP
    await db('claims').where({ id: claim.claim_id }).update({
      status: 'PICKED_UP',
      picked_up_at: new Date(),
    });

    // ARCH-6: Update consumer reliability score
    await db.raw(`
      UPDATE users
      SET
        successful_pickups = successful_pickups + 1,
        reliability_score = (successful_pickups + 1)::decimal / GREATEST(total_claims, 1)
      WHERE id = ?
    `, [claim.user_id]);

    // Notify consumer their pickup is confirmed
    sseManager.sendToConsumer(claim.user_id, 'pickup:confirmed', {
      deal_id: claim.deal_id,
      claim_id: claim.claim_id,
    });

    // Record analytics
    await db('vendor_analytics').insert({
      id: uuidv4(),
      vendor_id: vendorId,
      deal_id: claim.deal_id,
      deal_title_snapshot: claim.deal_title,
      deal_price_snapshot: claim.original_price,
      event_type: 'pickup_confirmed',
      items_rescued: 1,
      revenue_amount: claim.current_price,
    });

    // Update vendor aggregate stats
    await db('vendors').where({ id: vendorId }).increment('total_items_rescued', 1)
      .increment('total_revenue_recovered', parseFloat(claim.current_price));

    return res.status(200).json({ message: 'Pickup confirmed successfully' });

  } catch (err) {
    next(err);
  }
}

module.exports = {
  getVendorProfile,
  getVendorDeals,
  getVendorAnalytics,
  confirmPickup,
  geocodeHandler, // re-exported from geocodingService
};
