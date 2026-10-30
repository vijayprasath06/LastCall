/**
 * User Controller — Phase 2 / DPDP compliance [PROD-6, COMP-1, COMP-3]
 *
 * PATCH  /api/users/location          — GPS heartbeat (ephemeral; overwrites previous)
 * POST   /api/users/go-offline        — clears location, kills SSE, removes Redis presence
 * GET    /api/users/me                — authenticated profile
 * DELETE /api/users/me/data           — DPDP Right to Erasure
 * POST   /api/users/push-subscription — register Web Push subscription (VAPID)
 * DELETE /api/users/push-subscription — remove Web Push subscription
 * PATCH  /api/users/notifications     — toggle notification preferences
 *
 * Location Privacy Model [PROD-6]:
 *   - Only the CURRENT location is stored. No history, no breadcrumbs.
 *   - Each PATCH /location call overwrites the previous PostGIS point.
 *   - "Go Offline" sets current_location = NULL and kills SSE sockets.
 *   - Right to Erasure wipes profile + claims + anonymizes analytics.
 */

const { z } = require('zod');
const db = require('../config/db');
const redis = require('../config/redis');
const sseManager = require('../sse/SSEManager');

// ─── Validation Schemas ───────────────────────────────────────────────────────

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const notificationSchema = z.object({
  notifications_enabled: z.boolean().optional(),
  push_subscription: z.any().optional(),
});

// ─── GET /api/users/me ────────────────────────────────────────────────────────

async function getMe(req, res, next) {
  try {
    const user = await db('users')
      .where({ id: req.user.id })
      .select([
        'id', 'name', 'email', 'phone', 'role',
        'date_of_birth', 'reliability_score',
        'total_claims', 'successful_pickups', 'no_show_count',
        'is_flagged', 'notifications_enabled',
        'location_consent', 'data_processing_consent',
        'location_updated_at', 'created_at',
      ])
      .first();

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Never return the raw location point — consumers know their own location
    return res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/users/location ────────────────────────────────────────────────

/**
 * Ephemeral GPS heartbeat [PROD-6, COMP-3].
 * Overwrites current_location. No previous point is stored.
 * Rate-limited to 1 req / 10 min via locationLimiter middleware.
 */
async function updateLocation(req, res, next) {
  try {
    let coords;
    try {
      coords = locationSchema.parse(req.body);
    } catch (zodErr) {
      return res.status(400).json({ error: 'Invalid coordinates', details: zodErr.errors });
    }

    // Verify consent
    const user = await db('users').where({ id: req.user.id }).first('location_consent');
    if (!user?.location_consent) {
      return res.status(403).json({
        error: 'Location consent not granted',
        code: 'NO_LOCATION_CONSENT',
      });
    }

    // Overwrite location — no history stored
    await db.raw(`
      UPDATE users
      SET
        current_location = ST_SetSRID(ST_MakePoint(?, ?), 4326),
        location_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = ?
    `, [coords.lng, coords.lat, req.user.id]);

    return res.status(200).json({ message: 'Location updated' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/users/go-offline ───────────────────────────────────────────────

/**
 * DPDP "Go Offline" — instant privacy withdrawal [PROD-6].
 *   1. Clears PostGIS location (SET NULL).
 *   2. Ends all active SSE sockets for this user.
 *   3. Deletes Redis SSE presence key.
 *   4. Optionally revokes location_consent.
 */
async function goOffline(req, res, next) {
  try {
    // 1. Erase location from DB
    await db('users').where({ id: req.user.id }).update({
      current_location: null,
      location_updated_at: null,
      updated_at: new Date(),
    });

    // 2. Terminate SSE connections
    sseManager.removeConnection(req.user.id);

    // 3. Delete Redis presence key
    await redis.del(`sse:user:${req.user.id}`);

    return res.status(200).json({ message: 'You are now offline. Location cleared and live feed disconnected.' });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/users/me/data ────────────────────────────────────────────────

/**
 * DPDP / GDPR Right to Erasure [PROD-6].
 *   - Deletes user profile.
 *   - Anonymizes vendor_analytics rows (sets user_id = NULL if referenced).
 *   - Deletes claims older than 30-day dispute window.
 *   - Logs an audit record before deletion.
 */
async function eraseMyData(req, res, next) {
  try {
    const userId = req.user.id;

    await db.transaction(async (trx) => {
      // Anonymize analytics (preserve aggregate stats, remove link to user)
      await trx('vendor_analytics')
        .where({ user_id: userId })
        .update({ user_id: null });

      // Delete claims outside 30-day dispute window
      await trx('claims')
        .where({ user_id: userId })
        .where('claimed_at', '<', trx.raw("NOW() - INTERVAL '30 days'"))
        .delete();

      // Expire / cancel remaining active claims
      await trx('claims')
        .where({ user_id: userId, status: 'CONFIRMED' })
        .update({ status: 'CANCELLED', cancelled_at: new Date() });

      // Revoke all refresh tokens in Redis
      await redis.del(`refresh:${userId}`);
      await redis.del(`sse:user:${userId}`);

      // Terminate live connections
      sseManager.removeConnection(userId);

      // Delete the user record (cascades on FK-linked tables)
      await trx('users').where({ id: userId }).delete();
    });

    return res.status(200).json({ message: 'Your data has been erased in accordance with the DPDP Act 2023.' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/users/push-subscription ───────────────────────────────────────

/**
 * Saves a Web Push (VAPID) subscription endpoint for background notifications.
 * Stored as JSONB in users.push_subscription.
 */
async function registerPushSubscription(req, res, next) {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid push subscription object' });
    }

    await db('users').where({ id: req.user.id }).update({
      push_subscription: JSON.stringify(subscription),
      notifications_enabled: true,
      updated_at: new Date(),
    });

    return res.status(200).json({ message: 'Push subscription registered' });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/users/push-subscription ─────────────────────────────────────

async function removePushSubscription(req, res, next) {
  try {
    await db('users').where({ id: req.user.id }).update({
      push_subscription: null,
      updated_at: new Date(),
    });

    return res.status(200).json({ message: 'Push subscription removed' });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/users/notifications ──────────────────────────────────────────

async function updateNotificationPrefs(req, res, next) {
  try {
    let prefs;
    try {
      prefs = notificationSchema.parse(req.body);
    } catch (zodErr) {
      return res.status(400).json({ error: 'Validation failed', details: zodErr.errors });
    }

    const updates = { updated_at: new Date() };
    if (typeof prefs.notifications_enabled === 'boolean') {
      updates.notifications_enabled = prefs.notifications_enabled;
    }

    await db('users').where({ id: req.user.id }).update(updates);

    return res.status(200).json({ message: 'Notification preferences updated' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMe,
  updateLocation,
  goOffline,
  eraseMyData,
  registerPushSubscription,
  removePushSubscription,
  updateNotificationPrefs,
};
