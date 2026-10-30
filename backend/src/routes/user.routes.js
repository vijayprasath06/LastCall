/**
 * User Routes — /api/users/*
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const { locationLimiter } = require('../middleware/rateLimiter');
const {
  getMe,
  updateLocation,
  goOffline,
  eraseMyData,
  registerPushSubscription,
  removePushSubscription,
  updateNotificationPrefs,
} = require('../controllers/privacyController');

// GET /api/users/me
router.get('/me', authenticateJWT, getMe);

// PATCH /api/users/location — rate limited 1 req / 10 min / user [COMP-3]
router.patch('/location', authenticateJWT, locationLimiter, updateLocation);

// POST /api/users/go-offline — DPDP right to withdraw
router.post('/go-offline', authenticateJWT, goOffline);

// PATCH /api/users/notifications
router.patch('/notifications', authenticateJWT, updateNotificationPrefs);

// POST /api/users/push-subscription
router.post('/push-subscription', authenticateJWT, registerPushSubscription);

// DELETE /api/users/push-subscription
router.delete('/push-subscription', authenticateJWT, removePushSubscription);

// DELETE /api/users/me/data — DPDP Right to Erasure
router.delete('/me/data', authenticateJWT, eraseMyData);

module.exports = router;
