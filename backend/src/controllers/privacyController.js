/**
 * Privacy Controller — DPDP Act 2023 + GDPR compliance endpoints [PROD-6]
 *
 * Endpoints:
 *   PATCH  /api/users/location         — GPS heartbeat (10-min rate limited)
 *   POST   /api/users/go-offline       — "Go Offline": clear location + close SSE presence
 *   DELETE /api/users/me/data          — Right to Erasure
 *   POST   /api/users/push-subscription— Register Web Push VAPID subscription
 *   DELETE /api/users/push-subscription— Unsubscribe from push
 *   PATCH  /api/users/notifications    — Toggle notification preferences
 */

const { z } = require('zod');
const db = require('../config/db');
const redis = require('../config/redis');
const sseManager = require('../sse/SSEManager');

// ─── Location Heartbeat ───────────────────────────────────────────────────────

const locationSchema = z.object({
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/**
 * PATCH /api/users/location
 * Updates current_location (snapshot only — no history) and sets consent.
 * Rate limited: 1 req / 10 min / user [COMP-3]
 */
async function updateLocation(req, res, next) {
  try {
    let data;
    try {
      data = locationSchema.parse(req.body);
    } catch (zodErr) {
      return res.status(400).json({ error: 'Validation failed', details: zodErr.errors });
    }

    // Upsert location — overwrites previous snapshot (no history stored) [PROD-6]
    await db.raw(`
      UPDATE users
      SET
        current_location     = ST_SetSRID(ST_MakePoint(?, ?), 4326),
        location_updated_at  = NOW(),
        location_consent     = true,
        location_consent_at  = COALESCE(location_consent_at, NOW())
      WHERE id = ?
    `, [data.longitude, data.latitude, req.user.id]);

    return res.status(200).json({ message: 'Location updated' });
  } catch (err) {
    next(err);
  }
}

// ─── Go Offline ───────────────────────────────────────────────────────────────

/**
 * POST /api/users/go-offline
 * DPDP "Right to Withdraw" — immediately:
 *   1. Clears current_location to NULL (stops being matched for deals)
 *   2. Removes SSE presence key from Redis (stops push delivery)
 *   3. SSE connection will naturally drop on next heartbeat miss
 */
async function goOffline(req, res, next) {
  try {
    const userId = req.user.id;

    // Clear location from DB
    await db('users')
      .where({ id: userId })
      .update({
        current_location:    null,
        location_updated_at: null,
      });

    // Remove from SSE presence map in Redis
    await redis.del(`sse:user:${userId}`);

    // Forcefully close any active SSE connection
    sseManager.removeConnection(userId);

    return res.status(200).json({ message: 'Gone offline — location cleared and notifications paused' });
  } catch (err) {
    next(err);
  }
}

// ─── Right to Erasure ─────────────────────────────────────────────────────────

/**
 * DELETE /api/users/me/data
 * DPDP/GDPR Right to Erasure:
 *   - Wipes personal data (name, email, phone, location)
 *   - Anonymizes analytics (vendor analytics rows referencing this user have no user link)
 *   - Keeps claims older than 30 days for dispute resolution (anonymized)
 *   - Deletes claims newer than 30 days
 *   - Deletes user account
 */
async function eraseMyData(req, res, next) {
  try {
    const userId = req.user.id;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await db.transaction(async (trx) => {
      // Delete recent claims (< 30 days)
      await trx('claims')
        .where({ user_id: userId })
        .where('claimed_at', '>', thirtyDaysAgo)
        .del();

      // Anonymize older claims (keep for audit/dispute)
      await trx('claims')
        .where({ user_id: userId })
        .update({ user_id: null });

      // Revoke all Redis tokens
      await redis.del(`sse:user:${userId}`);

      // Delete user account (cascades to vendor record if vendor)
      await trx('users').where({ id: userId }).del();
    });

    return res.status(200).json({ message: 'All personal data erased. Account deleted.' });
  } catch (err) {
    next(err);
  }
}

// ─── Web Push Subscription ────────────────────────────────────────────────────

/**
 * POST /api/users/push-subscription
 * Registers a Web Push (VAPID) subscription object from the service worker.
 */
async function registerPushSubscription(req, res, next) {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid push subscription object' });
    }

    await db('users')
      .where({ id: req.user.id })
      .update({ push_subscription: JSON.stringify(subscription) });

    return res.status(200).json({ message: 'Push subscription registered' });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/users/push-subscription
 */
async function removePushSubscription(req, res, next) {
  try {
    await db('users')
      .where({ id: req.user.id })
      .update({ push_subscription: null, fcm_token: null });

    return res.status(200).json({ message: 'Push subscription removed' });
  } catch (err) {
    next(err);
  }
}

// ─── Notification Preferences ─────────────────────────────────────────────────

/**
 * PATCH /api/users/notifications
 * Body: { enabled: boolean, fcm_token?: string }
 */
async function updateNotificationPrefs(req, res, next) {
  try {
    const { enabled, fcm_token } = req.body;
    const updates = {};
    if (typeof enabled === 'boolean') updates.notifications_enabled = enabled;
    if (fcm_token !== undefined) updates.fcm_token = fcm_token;

    await db('users').where({ id: req.user.id }).update(updates);
    return res.status(200).json({ message: 'Notification preferences updated' });
  } catch (err) {
    next(err);
  }
}

// ─── Get Own Profile ──────────────────────────────────────────────────────────

/**
 * GET /api/users/me
 */
async function getMe(req, res, next) {
  try {
    const user = await db('users')
      .where({ id: req.user.id })
      .first([
        'id', 'name', 'email', 'phone', 'role',
        'notifications_enabled', 'location_consent',
        'data_processing_consent', 'total_claims',
        'successful_pickups', 'no_show_count',
        'reliability_score', 'is_flagged', 'created_at',
      ]);

    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  updateLocation,
  goOffline,
  eraseMyData,
  registerPushSubscription,
  removePushSubscription,
  updateNotificationPrefs,
  getMe,
};
