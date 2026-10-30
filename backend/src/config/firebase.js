/**
 * Firebase Admin SDK initialization
 *
 * Used by pushService.js for FCM background push notifications.
 * The SSE/FCM mutual exclusion logic ensures FCM is only called
 * when the user is NOT actively connected via SSE. [ARCH-4]
 *
 * BUG FIX: Added guard — only initializes when FIREBASE_PROJECT_ID env var
 * is set. This allows the backend to start cleanly in development without
 * Firebase credentials. pushService falls back to Web Push (VAPID) when
 * FCM is unavailable.
 */

const admin = require('firebase-admin');

// Only initialize if not already initialized AND credentials are present
if (!admin.apps.length) {
  if (process.env.FIREBASE_PROJECT_ID) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      });
      console.log('✅ Firebase Admin SDK initialized');
    } catch (err) {
      console.warn('⚠️  Firebase Admin SDK init failed (FCM disabled):', err.message);
    }
  } else {
    console.warn('⚠️  FIREBASE_PROJECT_ID not set — FCM push disabled (SSE + WebPush still active)');
  }
}

module.exports = admin;
