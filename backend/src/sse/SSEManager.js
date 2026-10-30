/**
 * SSE Connection Manager [CRIT-5]
 *
 * Manages in-process Server-Sent Events connections for both:
 *   - Consumer stream: /api/sse/consumer
 *   - Vendor stream:   /api/sse/vendor/:dealId
 *
 * Critical design rules:
 *   1. res.setTimeout(0) — disables Express default socket timeout
 *   2. 15-second heartbeat `: ping\n\n` keeps proxy alive + detects dead clients
 *   3. req.on('close') cleanup — immediately removes dead connections from pool
 *   4. Redis sse:user:{userId} presence key (30s TTL) — used by pushService.js
 *      for SSE/FCM mutual exclusion [ARCH-4]
 */

const redis = require('../config/redis');

// In-memory connection pools
// Map<userId, Set<{ res, heartbeatTimer }>>
const consumerConnections = new Map();

// Map<dealId, Set<{ res, heartbeatTimer }>>
const vendorConnections = new Map();

// ─── Consumer Connections ─────────────────────────────────────────────────────

function addConsumerConnection(userId, res) {
  if (!consumerConnections.has(userId)) {
    consumerConnections.set(userId, new Set());
  }
  consumerConnections.get(userId).add(res);
}

function removeConsumerConnection(userId, res) {
  const connections = consumerConnections.get(userId);
  if (!connections) return;
  connections.delete(res);
  if (connections.size === 0) {
    consumerConnections.delete(userId);
  }
}

// ─── Vendor Connections ───────────────────────────────────────────────────────

function addVendorConnection(dealId, res) {
  if (!vendorConnections.has(dealId)) {
    vendorConnections.set(dealId, new Set());
  }
  vendorConnections.get(dealId).add(res);
}

function removeVendorConnection(dealId, res) {
  const connections = vendorConnections.get(dealId);
  if (!connections) return;
  connections.delete(res);
  if (connections.size === 0) {
    vendorConnections.delete(dealId);
  }
}

// ─── Send Events ──────────────────────────────────────────────────────────────

/**
 * Send an SSE event to a specific consumer by userId.
 * @param {string} userId
 * @param {string} event - event name (e.g. 'deal:new')
 * @param {object} data  - payload object
 */
function sendToConsumer(userId, event, data) {
  const connections = consumerConnections.get(userId);
  if (!connections || connections.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of connections) {
    try {
      res.write(payload);
    } catch {
      // Connection already dead — will be cleaned up by req.on('close')
    }
  }
}

/**
 * Send an SSE event to a specific vendor deal stream.
 * @param {string} dealId
 * @param {string} event
 * @param {object} data
 */
function sendToVendorDeal(dealId, event, data) {
  const connections = vendorConnections.get(dealId);
  if (!connections || connections.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of connections) {
    try {
      res.write(payload);
    } catch {
      // Dead connection
    }
  }
}

/**
 * Broadcast an event to ALL active consumer connections.
 * Used sparingly (e.g. platform-wide announcements).
 */
function broadcastToAllConsumers(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, connections] of consumerConnections) {
    for (const res of connections) {
      try {
        res.write(payload);
      } catch {
        // Dead connection
      }
    }
  }
}

// ─── Force Disconnect ─────────────────────────────────────────────────────────

/**
 * Forcefully end all SSE connections for a user.
 * Called by Go Offline handler [PROD-6].
 */
function removeConnection(userId) {
  const connections = consumerConnections.get(userId);
  if (!connections) return;
  for (const res of connections) {
    try {
      res.end();
    } catch {
      // Already closed
    }
  }
  consumerConnections.delete(userId);
}

// ─── Diagnostic ───────────────────────────────────────────────────────────────

function getConsumerCount() {
  return consumerConnections.size;
}

function isUserConnected(userId) {
  const c = consumerConnections.get(userId);
  return c && c.size > 0;
}

module.exports = {
  // Consumer
  addConsumerConnection,
  removeConsumerConnection,
  sendToConsumer,
  removeConnection,
  // Vendor
  addVendorConnection,
  removeVendorConnection,
  sendToVendorDeal,
  // Broadcast
  broadcastToAllConsumers,
  // Diagnostics
  getConsumerCount,
  isUserConnected,
};
