/**
 * Claim Routes — /api/deals/:id/claim*
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const { authenticateJWT } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { claimLimiter, cancelLimiter } = require('../middleware/rateLimiter');
const { claimDeal, cancelClaim, getMyClaims } = require('../controllers/claimController');

// POST /api/deals/:id/claim — consumer claims a slot [CRIT-2]
router.post('/:id/claim', authenticateJWT, requireRole('consumer'), claimLimiter, claimDeal);

// POST /api/deals/:id/claim/cancel — voluntary cancel, no penalty [CRIT-4]
router.post('/:id/claim/cancel', authenticateJWT, requireRole('consumer'), cancelLimiter, cancelClaim);

// GET /api/deals/my-claims — consumer sees their own claims
router.get('/my-claims', authenticateJWT, requireRole('consumer'), getMyClaims);

module.exports = router;
