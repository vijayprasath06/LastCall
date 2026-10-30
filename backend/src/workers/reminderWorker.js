/**
 * Worker 4 — Pickup Reminder Push [PROD-3]
 *
 * Runs every 2 minutes.
 * Finds CONFIRMED claims where:
 *   - qr_expires_at is 10 minutes away
 *   - reminder_sent = false
 *
 * Sends a push reminder via the user's preferred channel (SSE or FCM/WebPush).
 * Marks reminder_sent = true to prevent duplicate reminders.
 */

const cron = require('node-cron');
const db = require('../config/db');
const { sendToUser } = require('../services/pushService');
const { addMinutes } = require('date-fns');

async function runReminderWorker() {
  try {
    const now = new Date();
    const in10Min = addMinutes(now, 10);
    const in12Min = addMinutes(now, 12);

    // Find claims expiring in 10–12 minutes with no reminder sent yet
    const claimsToRemind = await db('claims')
      .join('deals', 'claims.deal_id', 'deals.id')
      .join('users', 'claims.user_id', 'users.id')
      .where({ 'claims.status': 'CONFIRMED', 'claims.reminder_sent': false })
      .whereBetween('claims.qr_expires_at', [in10Min, in12Min])
      .select([
        'claims.id AS claim_id', 'claims.deal_id', 'claims.user_id',
        'deals.title AS deal_title', 'deals.expires_at',
        'users.fcm_token', 'users.push_subscription', 'users.notifications_enabled',
      ]);

    for (const claim of claimsToRemind) {
      await sendToUser(
        {
          id: claim.user_id,
          fcm_token: claim.fcm_token,
          push_subscription: claim.push_subscription,
          notifications_enabled: claim.notifications_enabled,
        },
        'claim:reminder',
        {
          deal_id: claim.deal_id,
          claim_id: claim.claim_id,
          title: `⏰ Hurry! Your claim expires in 10 minutes`,
          body: `Pick up "${claim.deal_title}" before your QR code expires.`,
        }
      );

      await db('claims').where({ id: claim.claim_id }).update({ reminder_sent: true });
    }

    if (claimsToRemind.length > 0) {
      console.log(`[Worker4] Sent ${claimsToRemind.length} pickup reminders`);
    }
  } catch (err) {
    console.error('[Worker4] Error:', err.message);
  }
}

cron.schedule('*/2 * * * *', runReminderWorker);
console.log('✅ Worker 4 (Pickup Reminder) started — runs every 2 minutes');

module.exports = { runReminderWorker };
