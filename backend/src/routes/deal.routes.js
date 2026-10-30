/**
 * Deal Routes — /api/deals/*
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { nearbyLimiter, postDealLimiter } = require('../middleware/rateLimiter');
const { postDeal, getNearbyDeals, getDeal, cancelDeal, patchDeal } = require('../controllers/dealController');

// GET /api/deals/nearby — consumer sees active nearby deals
router.get('/nearby', authenticateJWT, requireRole('consumer'), nearbyLimiter, getNearbyDeals);

// GET /api/deals/:id — any authenticated user can view a deal
router.get('/:id', authenticateJWT, getDeal);

// POST /api/deals — vendor posts a new deal
router.post('/', authenticateJWT, requireRole('vendor'), postDealLimiter, postDeal);

// PATCH /api/deals/:id — vendor edits a live deal (PROD-4 mutation rules enforced)
router.patch('/:id', authenticateJWT, requireRole('vendor'), patchDeal);

// DELETE /api/deals/:id — vendor cancels their own deal
router.delete('/:id', authenticateJWT, requireRole('vendor'), cancelDeal);

module.exports = router;
