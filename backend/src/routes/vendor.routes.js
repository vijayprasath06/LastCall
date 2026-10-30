/**
 * Vendor Routes — /api/vendor/*
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const {
  getVendorProfile,
  getVendorDeals,
  getVendorAnalytics,
  confirmPickup,
  geocodeHandler,
} = require('../controllers/vendorController');

// GET /api/vendor/me — own vendor profile
router.get('/me', authenticateJWT, requireRole('vendor'), getVendorProfile);

// GET /api/vendor/deals — own deal list
router.get('/deals', authenticateJWT, requireRole('vendor'), getVendorDeals);

// GET /api/vendor/analytics — time-series analytics
router.get('/analytics', authenticateJWT, requireRole('vendor'), getVendorAnalytics);

// POST /api/vendor/pickup/:qrToken — QR pickup verification [ARCH-6]
router.post('/pickup/:qrToken', authenticateJWT, requireRole('vendor'), confirmPickup);

// GET /api/vendor/geocode?address=... — free Nominatim geocoding [ARCH-8]
// Note: open to vendors only, no auth on address lookup itself
router.get('/geocode', authenticateJWT, requireRole('vendor'), geocodeHandler);

module.exports = router;
