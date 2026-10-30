/**
 * Redis client — ioredis
 *
 * Single Redis client instance shared across:
 * - JWT refresh token whitelist / blocklist [ARCH-7]
 * - SSE presence map: sse:user:{userId} with 30s TTL [CRIT-5, ARCH-4]
 * - Weather data cache: weather:{city} with 2100s TTL [Worker 5]
 * - BullMQ job queues (BullMQ creates its own ioredis instances internally)
 */

const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  // Retry strategy: exponential backoff up to 30s
  retryStrategy(times) {
    const delay = Math.min(times * 200, 30000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

module.exports = redis;
