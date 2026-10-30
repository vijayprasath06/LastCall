/**
 * Auth Routes — POST /api/auth/*
 *
 * Dual-role authentication portal:
 *   POST /register — consumer or vendor registration
 *   POST /login    — unified login with role-based JWT payload
 *   POST /refresh  — access token rotation
 *   POST /logout   — Redis blocklist revocation
 */

const express = require('express');
const router = express.Router();
const { register, login, refresh, logout } = require('../controllers/authController');
const { authenticateJWT } = require('../middleware/auth');
const { registerLimiter, loginLimiter, refreshLimiter } = require('../middleware/rateLimiter');

// POST /api/auth/register — 5 req / 15 min / IP
router.post('/register', registerLimiter, register);

// POST /api/auth/login — 10 req / 15 min / IP
router.post('/login', loginLimiter, login);

// POST /api/auth/refresh — 20 req / 15 min / IP
router.post('/refresh', refreshLimiter, refresh);

// POST /api/auth/logout — requires valid access token to blocklist it
router.post('/logout', authenticateJWT, logout);

module.exports = router;
