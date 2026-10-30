/**
 * SSE Routes — Real-time event streams [CRIT-5, ARCH-4]
 *
 * GET /api/sse/consumer        — consumer live deal feed
 * GET /api/sse/vendor/:dealId  — vendor per-deal claim/cancel feed
 *
 * Critical SSE headers:
 *   Content-Type: text/event-stream
 *   Cache-Control: no-cache
 *   Connection: keep-alive
 *   res.setTimeout(0)  ← disables Express default socket timeout
 *
 * Heartbeat: `: ping\n\n` every 15s
 *   - Keeps proxy alive (prevents Nginx 65s timeout)
 *   - Refreshes Redis sse:user:{userId} presence key (30s TTL)
 *   - Dead client detection: if res.write throws, cleanup fires
 *
 * Mutual Exclusion: presence key used by pushService.js to choose
 *   SSE (if online) vs FCM/WebPush (if offline) [ARCH-4]
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const redis = require('../config/redis');
const sseManager = require('../sse/SSEManager');

// ─── Consumer SSE Stream ──────────────────────────────────────────────────────

router.get('/consumer', authenticateJWT, requireRole('consumer'), (req, res) => {
  const userId = req.user.id;

  // Required SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering at header level
  res.setTimeout(0);  // CRITICAL: disable Express default socket timeout [CRIT-5]

  // Send initial connection confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, timestamp: new Date().toISOString() })}\n\n`);

  // Register SSE presence in Redis (30s TTL) [ARCH-4]
  redis.set(`sse:user:${userId}`, '1', 'EX', 30);

  // Register connection in SSEManager pool
  sseManager.addConsumerConnection(userId, res);

  // Heartbeat every 15 seconds [CRIT-5]
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
      // Refresh Redis presence key
      redis.set(`sse:user:${userId}`, '1', 'EX', 30);
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  // CRITICAL: Clean up immediately on client disconnect [CRIT-5]
  req.on('close', () => {
    clearInterval(heartbeat);
    sseManager.removeConsumerConnection(userId, res);
    redis.del(`sse:user:${userId}`);
  });
});

// ─── Vendor SSE Stream (per deal) ─────────────────────────────────────────────

router.get('/vendor/:dealId', authenticateJWT, requireRole('vendor'), (req, res) => {
  const { dealId } = req.params;
  const vendorId = req.user.vendorId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setTimeout(0);

  res.write(`event: connected\ndata: ${JSON.stringify({ dealId, vendorId, timestamp: new Date().toISOString() })}\n\n`);

  sseManager.addVendorConnection(dealId, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseManager.removeVendorConnection(dealId, res);
  });
});

module.exports = router;
