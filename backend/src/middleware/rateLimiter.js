/**
 * Rate Limiter middleware — per-route express-rate-limit configs [COMP-3]
 *
 * Applied to routes as documented in blueprint Section 7 API Design.
 * Uses in-memory store (default) — suitable for single-instance dev.
 * For multi-instance production: switch store to Redis via rate-limit-redis.
 */

const rateLimit = require('express-rate-limit');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function createLimiter({ windowMinutes, max, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message || 'Too many requests, please try again later.' },
  });
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────
const registerLimiter = createLimiter({ windowMinutes: 15, max: 5,  message: 'Too many registration attempts' });
const loginLimiter    = createLimiter({ windowMinutes: 15, max: 10, message: 'Too many login attempts' });
const refreshLimiter  = createLimiter({ windowMinutes: 15, max: 20, message: 'Too many token refresh requests' });

// ─── Deal Routes ──────────────────────────────────────────────────────────────
const nearbyLimiter   = createLimiter({ windowMinutes: 1,  max: 30, message: 'Slow down — nearby deals' });
const claimLimiter    = createLimiter({ windowMinutes: 1,  max: 5,  message: 'Too many claim attempts' });
const cancelLimiter   = createLimiter({ windowMinutes: 1,  max: 10, message: 'Too many cancel attempts' });

// ─── Vendor Routes ────────────────────────────────────────────────────────────
const postDealLimiter = createLimiter({ windowMinutes: 60, max: 10, message: 'Deal posting limit exceeded' });

// ─── AI Routes ────────────────────────────────────────────────────────────────
const snapToPostLimiter = createLimiter({ windowMinutes: 60, max: 20, message: 'AI vision limit exceeded' });

// ─── Location Heartbeat ───────────────────────────────────────────────────────
const locationLimiter = createLimiter({ windowMinutes: 10, max: 1,  message: 'Location update too frequent' });

module.exports = {
  registerLimiter,
  loginLimiter,
  refreshLimiter,
  nearbyLimiter,
  claimLimiter,
  cancelLimiter,
  postDealLimiter,
  snapToPostLimiter,
  locationLimiter,
};
