/**
 * Deal Controller — Phase 5
 *
 * POST   /api/deals          — vendor posts a new deal (Snap-to-Post or manual)
 * GET    /api/deals/nearby   — consumer fetches active nearby deals (geofenced)
 * GET    /api/deals/:id      — get a single deal with distance info
 * PATCH  /api/deals/:id      — vendor edits deal (only before first claim)
 * DELETE /api/deals/:id      — vendor cancels deal
 */

const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { differenceInMinutes } = require('date-fns');

const db = require('../config/db');
const { computeRadius } = require('../services/radiusEngine');
const { calculateRUS } = require('../services/rusCalculator');
const { getWeatherCondition } = require('../services/weatherService');
const { fanOutDealNotification } = require('../services/pushService');
const { findNearbyDealsForUser, getDealWithDistance } = require('../queries/geospatialQueries');
const sseManager = require('../sse/SSEManager');

// ─── Validation Schemas ───────────────────────────────────────────────────────

const postDealSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    unit: z.string().min(1),
  })).min(1),
  dietary_tags: z.array(z.string()).optional().default([]),
  image_url: z.string().url().optional(),
  original_price: z.number().positive(),
  start_price: z.number().positive(),
  min_rescue_price: z.number().positive(),
  total_quantity: z.number().int().positive().max(100),
  expires_at: z.string().datetime(),  // ISO 8601
}).refine((d) => d.start_price <= d.original_price, {
  message: 'start_price must be ≤ original_price',
  path: ['start_price'],
}).refine((d) => d.min_rescue_price < d.start_price, {
  message: 'min_rescue_price must be < start_price',
  path: ['min_rescue_price'],
});

// ─── POST /api/deals ─────────────────────────────────────────────────────────

async function postDeal(req, res, next) {
  try {
    let data;
    try {
      data = postDealSchema.parse(req.body);
    } catch (zodErr) {
      return res.status(400).json({ error: 'Validation failed', details: zodErr.errors });
    }

    // Verify vendor is approved
    const vendor = await db('vendors').where({ id: req.user.vendorId }).first();
    if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });
    if (!vendor.is_verified) {
      return res.status(403).json({ error: 'Vendor not yet approved by admin', code: 'VENDOR_UNVERIFIED' });
    }

    const expiresAt = new Date(data.expires_at);
    const minutesUntilClose = differenceInMinutes(expiresAt, new Date());
    if (minutesUntilClose < 5) {
      return res.status(400).json({ error: 'Deal must expire at least 5 minutes from now' });
    }
    if (minutesUntilClose > 480) {
      return res.status(400).json({ error: 'Deal cannot expire more than 8 hours from now' });
    }

    // Compute dynamic push radius
    const effectiveRadius = computeRadius({
      cityDensityTier: vendor.city_density_tier,
      minutesUntilClose,
      totalQuantity: data.total_quantity,
      avgClaimRate: vendor.avg_claim_rate,
    });

    // Get weather for RUS initial calculation
    const weatherCondition = await getWeatherCondition(vendor.city || 'Chennai');

    // Calculate initial RUS
    const { score: urgencyScore, label: urgencyLabel } = calculateRUS({
      minutesRemaining: minutesUntilClose,
      itemsRemaining: data.total_quantity,
      avgClaimLagSecs: vendor.avg_claim_lag_secs,
      distanceKm: 1.0,
      weatherCondition,
    });

    const dealId = uuidv4();

    // Insert deal using vendor's verified_location snapshot
    await db.raw(`
      INSERT INTO deals (
        id, vendor_id, title, description, items, dietary_tags, image_url,
        original_price, start_price, current_price, min_rescue_price,
        total_quantity, status, expires_at, posted_at,
        deal_location, effective_radius_meters,
        urgency_score, urgency_label, rus_updated_at
      )
      SELECT
        ?, ?, ?, ?, ?::jsonb, ?, ?,
        ?, ?, ?, ?,
        ?, 'ACTIVE', ?, NOW(),
        v.verified_location, ?,
        ?, ?, NOW()
      FROM vendors v WHERE v.id = ?
    `, [
      dealId, vendor.id, data.title, data.description || null,
      JSON.stringify(data.items), data.dietary_tags, data.image_url || null,
      data.original_price, data.start_price, data.start_price, data.min_rescue_price,
      data.total_quantity, expiresAt,
      effectiveRadius,
      urgencyScore, urgencyLabel,
      vendor.id,
    ]);

    // Update vendor stats
    await db('vendors').where({ id: vendor.id }).increment('total_deals_posted', 1);

    // Record analytics event
    await db('vendor_analytics').insert({
      id: uuidv4(),
      vendor_id: vendor.id,
      deal_id: dealId,
      deal_title_snapshot: data.title,
      deal_price_snapshot: data.original_price,
      event_type: 'deal_posted',
      users_notified: 0, // updated after fan-out
    });

    const deal = await db('deals').where({ id: dealId }).first();

    // Async fan-out push notifications to eligible consumers
    const dealPayload = {
      deal_id: dealId,
      deal_title: deal.title,
      vendor_name: vendor.business_name,
      current_price: deal.current_price,
      urgency_label: deal.urgency_label,
      items_remaining: deal.total_quantity,
      expires_at: deal.expires_at,
    };

    fanOutDealNotification(dealId, dealPayload)
      .then(async (usersNotified) => {
        // Update analytics row with actual users_notified count
        await db('vendor_analytics')
          .where({ deal_id: dealId, event_type: 'deal_posted' })
          .update({ users_notified: usersNotified });
      })
      .catch((err) => console.error('[FanOut] Error:', err.message));

    return res.status(201).json({ deal, message: 'Deal posted and notifications sent' });

  } catch (err) {
    next(err);
  }
}

// ─── GET /api/deals/nearby ───────────────────────────────────────────────────

async function getNearbyDeals(req, res, next) {
  try {
    const userId = req.user.id;
    const radius = parseInt(req.query.radius) || 5000;

    const deals = await findNearbyDealsForUser(userId, Math.min(radius, 10000));
    return res.status(200).json({ deals, count: deals.length });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/deals/:id ───────────────────────────────────────────────────────

async function getDeal(req, res, next) {
  try {
    const deal = await getDealWithDistance(req.params.id, req.user.id);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    return res.status(200).json({ deal });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/deals/:id ────────────────────────────────────────────────────

async function cancelDeal(req, res, next) {
  try {
    const vendorId = req.user.vendorId;
    const { id: dealId } = req.params;

    const deal = await db('deals').where({ id: dealId, vendor_id: vendorId }).first();
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    if (!['ACTIVE', 'PARTIALLY_CLAIMED'].includes(deal.status)) {
      return res.status(409).json({ error: `Cannot cancel a deal in status: ${deal.status}` });
    }

    await db('deals').where({ id: dealId }).update({ status: 'CANCELLED', updated_at: new Date() });

    // Notify consumers with active claims
    const activeClaims = await db('claims').where({ deal_id: dealId, status: 'CONFIRMED' });
    for (const claim of activeClaims) {
      sseManager.sendToConsumer(claim.user_id, 'deal:cancelled', { deal_id: dealId });
    }

    await db('vendor_analytics').insert({
      id: uuidv4(),
      vendor_id: vendorId,
      deal_id: dealId,
      deal_title_snapshot: deal.title,
      deal_price_snapshot: deal.original_price,
      event_type: 'deal_cancelled',
    });

    return res.status(200).json({ message: 'Deal cancelled' });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/deals/:id ─────────────────────────────────────────────────────

/**
 * Vendor edits a live deal — enforces all PROD-4 immutability rules:
 *   - expires_at: can ONLY be shortened, never extended [PROD-4]
 *   - total_quantity: cannot be reduced below current claimed_quantity [PROD-4]
 *   - original_price, start_price, min_rescue_price: immutable post-creation [PROD-4]
 *   - items: allowed; triggers deal:items_updated SSE warning to claimants [PROD-4]
 *
 * Only ACTIVE or PARTIALLY_CLAIMED deals can be patched.
 */
async function patchDeal(req, res, next) {
  try {
    const vendorId = req.user.vendorId;
    const { id: dealId } = req.params;
    const { expires_at, total_quantity, items, description, dietary_tags } = req.body;

    // Verify the deal belongs to this vendor
    const deal = await db('deals')
      .where({ id: dealId, vendor_id: vendorId })
      .first();

    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    if (!['ACTIVE', 'PARTIALLY_CLAIMED'].includes(deal.status)) {
      return res.status(409).json({
        error: `Cannot edit a deal in status: ${deal.status}`,
        code: 'DEAL_NOT_EDITABLE',
      });
    }

    // PROD-4: Price fields are immutable post-creation
    const immutablePriceFields = ['original_price', 'start_price', 'min_rescue_price'];
    for (const field of immutablePriceFields) {
      if (req.body[field] !== undefined) {
        return res.status(403).json({
          error: `${field} is immutable after deal creation`,
          code: 'PRICE_IMMUTABLE',
        });
      }
    }

    const updates = { updated_at: new Date() };
    const warnings = [];

    // PROD-4: expires_at can only be SHORTENED, never extended
    if (expires_at !== undefined) {
      const newExpiry = new Date(expires_at);
      const currentExpiry = new Date(deal.expires_at);
      if (newExpiry >= currentExpiry) {
        return res.status(400).json({
          error: 'expires_at can only be shortened, not extended',
          code: 'EXPIRY_EXTENSION_FORBIDDEN',
          current_expires_at: deal.expires_at,
        });
      }
      if (newExpiry <= new Date()) {
        return res.status(400).json({ error: 'New expires_at must be in the future' });
      }
      updates.expires_at = newExpiry;
    }

    // PROD-4: total_quantity cannot be reduced below claimed_quantity
    if (total_quantity !== undefined) {
      if (total_quantity < deal.claimed_quantity) {
        return res.status(409).json({
          error: `Cannot reduce total_quantity below current claimed_quantity (${deal.claimed_quantity})`,
          code: 'QUANTITY_BELOW_CLAIMED',
          claimed_quantity: deal.claimed_quantity,
        });
      }
      updates.total_quantity = total_quantity;
    }

    // Items update is allowed — triggers SSE warning to confirmed claimants
    if (items !== undefined) {
      updates.items = JSON.stringify(items);
      warnings.push('items_updated');
    }

    if (description !== undefined) updates.description = description;
    if (dietary_tags !== undefined) updates.dietary_tags = dietary_tags;

    await db('deals').where({ id: dealId }).update(updates);

    // PROD-4: Notify confirmed claimants of item changes via SSE
    if (warnings.includes('items_updated')) {
      const confirmedClaims = await db('claims')
        .where({ deal_id: dealId, status: 'CONFIRMED' });

      for (const claim of confirmedClaims) {
        sseManager.sendToConsumer(claim.user_id, 'deal:items_updated', {
          deal_id: dealId,
          message: 'The vendor updated the item list for this deal. Please review before pickup.',
          new_items: items,
        });
      }
    }

    const updatedDeal = await db('deals').where({ id: dealId }).first();

    return res.status(200).json({
      deal: updatedDeal,
      warnings: warnings.length > 0 ? warnings : undefined,
      message: 'Deal updated',
    });

  } catch (err) {
    next(err);
  }
}

module.exports = { postDeal, getNearbyDeals, getDeal, cancelDeal, patchDeal };
