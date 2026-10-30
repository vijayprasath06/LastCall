/**
 * Push Service — SSE/FCM Mutual Exclusion [ARCH-4]
 *
 * Decides delivery channel per user:
 *   1. If Redis sse:user:{userId} key exists → user is SSE-connected → send via SSE
 *   2. Else if user has push_subscription → send Web Push (VAPID)
 *   3. Else if user has fcm_token → send FCM background push
 *   4. Else → skip (no delivery channel available)
 *
 * This prevents duplicate notifications (SSE + FCM simultaneously).
 * The SSE presence key (30s TTL, refreshed every 15s by heartbeat) is
 * the authoritative signal for "user is online".
 *
 * Fan-out pattern (used on deal post):
 *   Call fanOutDealNotification(dealId) → queries PostGIS for eligible consumers
 *   → sends each user via their preferred channel concurrently.
 */

const webpush = require('web-push');
const admin = require('../config/firebase');
const redis = require('../config/redis');
const sseManager = require('../sse/SSEManager');
const { findEligibleConsumers } = require('../queries/geospatialQueries');

// Configure VAPID for Web Push
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@egpp.app',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || '',
);

// ─── Channel Decision Logic ───────────────────────────────────────────────────

/**
 * Send a notification to a single user via the best available channel.
 *
 * @param {object} user - { id, fcm_token, push_subscription, notifications_enabled }
 * @param {string} event - SSE event name (e.g. 'deal:new')
 * @param {object} payload - notification data
 */
async function sendToUser(user, event, payload) {
  if (!user.notifications_enabled) return;

  // 1. Check SSE presence (authoritative "online" signal) [ARCH-4]
  const isOnSSE = await redis.exists(`sse:user:${user.id}`);

  if (isOnSSE) {
    sseManager.sendToConsumer(user.id, event, payload);
    return;
  }

  // 2. Web Push (VAPID) — browser background push
  if (user.push_subscription) {
    try {
      const sub = typeof user.push_subscription === 'string'
        ? JSON.parse(user.push_subscription)
        : user.push_subscription;

      await webpush.sendNotification(sub, JSON.stringify({
        event,
        ...payload,
      }));
      return;
    } catch (err) {
      // 410 Gone = subscription expired — clear it from DB
      if (err.statusCode === 410) {
        const db = require('../config/db');
        await db('users').where({ id: user.id }).update({ push_subscription: null });
      }
      // Fall through to FCM
    }
  }

  // 3. FCM — native app / PWA installed background push
  if (user.fcm_token) {
    try {
      await admin.messaging().send({
        token: user.fcm_token,
        data: { event, payload: JSON.stringify(payload) },
        notification: {
          title: payload.title || 'New Deal Near You!',
          body: payload.body || 'A food rescue deal is available nearby.',
        },
        android: { priority: 'high' },
        apns: { payload: { aps: { contentAvailable: true } } },
      });
    } catch (err) {
      // Invalid/expired FCM token — clear it
      if (err.code === 'messaging/invalid-registration-token' ||
          err.code === 'messaging/registration-token-not-registered') {
        const db = require('../config/db');
        await db('users').where({ id: user.id }).update({ fcm_token: null });
      }
    }
  }
}

// ─── Fan-Out ──────────────────────────────────────────────────────────────────

/**
 * Fan out a deal:new notification to ALL eligible consumers within the deal's geofence.
 * Called immediately after deal is saved to DB.
 *
 * @param {string} dealId
 * @param {object} dealPayload - deal data to send as SSE/push payload
 * @returns {Promise<number>} count of users notified
 */
async function fanOutDealNotification(dealId, dealPayload) {
  const consumers = await findEligibleConsumers(dealId);

  if (consumers.length === 0) return 0;

  // Concurrent fan-out with concurrency cap to avoid overwhelming FCM
  const CONCURRENCY = 50;
  let count = 0;

  for (let i = 0; i < consumers.length; i += CONCURRENCY) {
    const batch = consumers.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map((user) => sendToUser(user, 'deal:new', {
        ...dealPayload,
        distance_meters: Math.round(user.distance_meters),
        title: `🍱 ${dealPayload.vendor_name}: ${dealPayload.deal_title}`,
        body: `${dealPayload.items_remaining} item(s) left — ${dealPayload.urgency_label}`,
      }))
    );
    count += batch.length;
  }

  return count;
}

/**
 * Send a deal:update event to all SSE-connected consumers who were notified about this deal.
 * (e.g. price drop, slot released after cancel)
 *
 * @param {string} dealId
 * @param {object} updatePayload
 */
async function broadcastDealUpdate(dealId, updatePayload) {
  const consumers = await findEligibleConsumers(dealId);
  for (const user of consumers) {
    const isOnSSE = await redis.exists(`sse:user:${user.id}`);
    if (isOnSSE) {
      sseManager.sendToConsumer(user.id, 'deal:update', updatePayload);
    }
  }
}

/**
 * Fan out a deal:price_drop notification to ALL eligible consumers within the deal's geofence.
 * Used by Worker 6 (priceDroppingWorker) after a Dutch Auction price step.
 *
 * SSE-connected users get inline event; offline users get FCM/Web Push.
 *
 * @param {string} dealId
 * @param {object} dropPayload - { deal_id, old_price, new_price, urgency_label, ... }
 * @returns {Promise<number>} count of users notified
 */
async function fanOutPriceDropNotification(dealId, dropPayload) {
  const consumers = await findEligibleConsumers(dealId);
  if (consumers.length === 0) return 0;

  const CONCURRENCY = 50;
  let count = 0;

  for (let i = 0; i < consumers.length; i += CONCURRENCY) {
    const batch = consumers.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map((user) => sendToUser(user, 'deal:price_drop', {
        ...dropPayload,
        distance_meters: Math.round(user.distance_meters),
        title: `💸 Price Dropped: ${dropPayload.deal_title || 'Food Deal'}`,
        body: `Now ₹${dropPayload.new_price} — ${dropPayload.urgency_label}`,
      }))
    );
    count += batch.length;
  }

  return count;
}

module.exports = { sendToUser, fanOutDealNotification, fanOutPriceDropNotification, broadcastDealUpdate };
