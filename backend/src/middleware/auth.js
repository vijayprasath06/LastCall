/**
 * Auth Middleware — JWT verification + Redis blocklist check [ARCH-7]
 *
 * Verifies the Bearer access token on every protected route.
 * Also checks the Redis blocklist for immediately revoked tokens (post-logout).
 *
 * Usage:
 *   router.get('/protected', authenticateJWT, handler);
 *   router.get('/sse/consumer', authenticateJWT, sseHandler);
 */

const jwt = require('jsonwebtoken');
const redis = require('../config/redis');

/**
 * Middleware: verify JWT access token and reject if on blocklist.
 */
async function authenticateJWT(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid access token' });
  }

  // ARCH-7 FIX: Check Redis blocklist for immediately revoked tokens (e.g. post-logout)
  const isBlocked = await redis.exists(`blocklist:${decoded.jti}`);
  if (isBlocked) {
    return res.status(401).json({ error: 'Token has been revoked', code: 'TOKEN_REVOKED' });
  }

  // Attach decoded payload to request for downstream use
  // Payload shape: { id, role: 'consumer'|'vendor'|'admin', vendorId, jti, iat, exp }
  req.user = decoded;
  next();
}

module.exports = { authenticateJWT };
