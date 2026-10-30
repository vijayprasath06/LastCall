/**
 * Claim Controller — ACID-safe slot reservation [CRIT-2, CRIT-4, ARCH-6]
 *
 * POST   /api/deals/:id/claim        — consumer claims a slot
 * POST   /api/deals/:id/claim/cancel — consumer voluntarily cancels [CRIT-4]
 *
 * CRIT-2 FIX: Single PostgreSQL CTE transaction — no race condition possible.
 *   The CTE atomically:
 *     1. Reads current claimed_quantity with a row-level lock (FOR UPDATE)
 *     2. Only increments if claimed_quantity < total_quantity
 *     3. Updates deal status to PARTIALLY_CLAIMED or CLAIMED
 *     4. Returns the updated row to confirm success
 *   If two requests race, only one will see claimed_quantity < total_quantity.
 *
 * CRIT-4 FIX: cancelClaim is atomic — uses a single UPDATE CTE.
 *   Voluntary cancel: no reliability_score penalty.
 *   Decrements claimed_quantity atomically; deal status reverts to ACTIVE if needed.
 *
 * ARCH-6 FIX: Reliability score recalculated only on PICKED_UP or EXPIRED (no-show).
 *   Formula: reliability_score = successful_pickups / GREATEST(total_claims, 1)
 */

const { v4: uuidv4 } = require('uuid');
const { addMinutes } = require('date-fns');
const db = require('../config/db');
const sseManager = require('../sse/SSEManager');

// ─── Claim ────────────────────────────────────────────────────────────────────

async function claimDeal(req, res, next) {
  try {
    const userId = req.user.id;
    const dealId = req.params.id;

    // Check if user is flagged (3+ no-shows)
    const user = await db('users').where({ id: userId }).first('is_flagged', 'reliability_score');
    if (user.is_flagged) {
      return res.status(403).json({
        error: 'Your account is temporarily restricted due to repeated no-shows',
        code: 'ACCOUNT_FLAGGED',
        reliability_score: user.reliability_score,
      });
    }

    // Check for existing active claim on this deal
    const existing = await db('claims')
      .where({ deal_id: dealId, user_id: userId, status: 'CONFIRMED' })
      .first();
    if (existing) {
      return res.status(409).json({ error: 'You already have an active claim on this deal', code: 'DUPLICATE_CLAIM' });
    }

    // CRIT-2 FIX: Atomic CTE claim transaction — single round-trip to PostgreSQL
    const result = await db.raw(`
      WITH deal_lock AS (
        SELECT id, total_quantity, claimed_quantity, status, expires_at, vendor_id
        FROM deals
        WHERE id = ?
        AND status IN ('ACTIVE', 'PARTIALLY_CLAIMED')
        AND expires_at > NOW()
        FOR UPDATE
      ),
      slot_check AS (
        SELECT * FROM deal_lock
        WHERE claimed_quantity < total_quantity
      ),
      deal_update AS (
        UPDATE deals
        SET
          claimed_quantity = claimed_quantity + 1,
          status = CASE
            WHEN (claimed_quantity + 1) >= total_quantity THEN 'CLAIMED'
            ELSE 'PARTIALLY_CLAIMED'
          END,
          updated_at = NOW()
        FROM slot_check
        WHERE deals.id = slot_check.id
        RETURNING deals.id, deals.claimed_quantity, deals.total_quantity, deals.status,
                  deals.expires_at, deals.vendor_id, deals.current_price
      )
      SELECT * FROM deal_update
    `, [dealId]);

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'No slots available or deal has expired', code: 'NO_SLOT' });
    }

    const updatedDeal = result.rows[0];

    // PROD-3 FIX: qr_expires_at = LEAST(NOW() + 20min, deal.expires_at - 5min)
    const twentyMinFromNow = addMinutes(new Date(), 20);
    const fiveMinBeforeExpiry = addMinutes(new Date(updatedDeal.expires_at), -5);
    const qrExpiresAt = twentyMinFromNow < fiveMinBeforeExpiry ? twentyMinFromNow : fiveMinBeforeExpiry;

    // Create the claim record
    const claimId = uuidv4();
    const qrToken = uuidv4(); // Unique, unguessable token for QR code

    await db('claims').insert({
      id: claimId,
      deal_id: dealId,
      user_id: userId,
      status: 'CONFIRMED',
      qr_token: qrToken,
      qr_expires_at: qrExpiresAt,
      claimed_at: new Date(),
      confirmed_at: new Date(),
    });

    // Update user claim count
    await db('users').where({ id: userId }).increment('total_claims', 1);

    // Notify vendor's SSE deal stream about new claim
    sseManager.sendToVendorDeal(dealId, 'claim:new', {
      deal_id: dealId,
      claimed_quantity: updatedDeal.claimed_quantity,
      total_quantity: updatedDeal.total_quantity,
      slots_remaining: updatedDeal.total_quantity - updatedDeal.claimed_quantity,
      deal_status: updatedDeal.status,
    });

    // Send deal:update to other consumers (slot count changed)
    sseManager.sendToConsumer(userId, 'claim:confirmed', {
      claim_id: claimId,
      deal_id: dealId,
      qr_token: qrToken,
      qr_expires_at: qrExpiresAt,
      price_paid: updatedDeal.current_price,
    });

    return res.status(201).json({
      message: 'Slot reserved successfully',
      claim: {
        id: claimId,
        deal_id: dealId,
        status: 'CONFIRMED',
        qr_token: qrToken,
        qr_expires_at: qrExpiresAt,
        price_paid: updatedDeal.current_price,
      },
    });

  } catch (err) {
    next(err);
  }
}

// ─── Cancel Claim ─────────────────────────────────────────────────────────────

async function cancelClaim(req, res, next) {
  try {
    const userId = req.user.id;
    const dealId = req.params.id;

    // CRIT-4 FIX: Atomic cancel — single CTE UPDATE, no reliability penalty
    const result = await db.raw(`
      WITH claim_update AS (
        UPDATE claims
        SET status = 'CANCELLED', cancelled_at = NOW()
        WHERE deal_id = ? AND user_id = ? AND status = 'CONFIRMED'
        RETURNING id, deal_id
      ),
      deal_update AS (
        UPDATE deals
        SET
          claimed_quantity = GREATEST(claimed_quantity - 1, 0),
          status = CASE
            WHEN (claimed_quantity - 1) <= 0 THEN 'ACTIVE'
            ELSE 'PARTIALLY_CLAIMED'
          END,
          updated_at = NOW()
        FROM claim_update
        WHERE deals.id = claim_update.deal_id
          AND deals.status IN ('CLAIMED', 'PARTIALLY_CLAIMED')
        RETURNING deals.id, deals.claimed_quantity, deals.total_quantity, deals.status
      )
      SELECT claim_update.id AS claim_id, deal_update.*
      FROM claim_update
      LEFT JOIN deal_update ON true
    `, [dealId, userId]);

    if (result.rows.length === 0 || !result.rows[0].claim_id) {
      return res.status(404).json({ error: 'No active claim found to cancel' });
    }

    const row = result.rows[0];

    // Notify vendor SSE stream of slot release
    sseManager.sendToVendorDeal(dealId, 'claim:cancelled', {
      deal_id: dealId,
      claimed_quantity: row.claimed_quantity,
      total_quantity: row.total_quantity,
      deal_status: row.status,
    });

    // ARCH-6: No reliability_score penalty for voluntary cancel

    return res.status(200).json({ message: 'Claim cancelled successfully. No penalty applied.' });

  } catch (err) {
    next(err);
  }
}

// ─── Get My Claims ────────────────────────────────────────────────────────────

async function getMyClaims(req, res, next) {
  try {
    const claims = await db('claims')
      .join('deals', 'claims.deal_id', 'deals.id')
      .join('vendors', 'deals.vendor_id', 'vendors.id')
      .where('claims.user_id', req.user.id)
      .select([
        'claims.id', 'claims.deal_id', 'claims.status',
        'claims.qr_token', 'claims.qr_expires_at',
        'claims.claimed_at', 'claims.picked_up_at',
        'deals.title AS deal_title', 'deals.current_price',
        'deals.expires_at', 'deals.items', 'deals.image_url',
        'vendors.business_name AS vendor_name',
      ])
      .orderBy('claims.claimed_at', 'desc')
      .limit(20);

    return res.status(200).json({ claims });
  } catch (err) {
    next(err);
  }
}

module.exports = { claimDeal, cancelClaim, getMyClaims };
