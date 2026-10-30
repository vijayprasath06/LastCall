/**
 * PostGIS Geospatial Queries [CRIT-1, ARCH-5, PROD-1]
 *
 * Core spatial matching query used to find eligible consumers to notify
 * when a new deal is posted or a slot is released.
 *
 * CRIT-1 FIX: Uses indexed JOIN (not CROSS JOIN / Cartesian product)
 *   FROM deals d JOIN users u ON ST_DWithin(...)
 *   The GIST index on users.current_location is hit as the JOIN predicate.
 *
 * ARCH-5 FIX: Stale-location users excluded via JOIN predicate
 *   location_updated_at > NOW() - INTERVAL '15 minutes'
 *   These users receive NEITHER SSE nor FCM notifications.
 *
 * PROD-1 FIX: 7-day vendor exclusion filter REMOVED.
 *   Dutch Auction pricing handles cannibalization prevention instead.
 */

const db = require('../config/db');

/**
 * Find all eligible consumers within a deal's geofence radius.
 * Returns user push delivery fields (fcm_token, push_subscription, SSE preference).
 *
 * @param {string} dealId - UUID of the deal to match against
 * @returns {Promise<Array<{
 *   id: string,
 *   fcm_token: string|null,
 *   push_subscription: object|null,
 *   notifications_enabled: boolean,
 *   distance_meters: number
 * }>>}
 */
async function findEligibleConsumers(dealId) {
  const result = await db.raw(`
    SELECT
      u.id,
      u.fcm_token,
      u.push_subscription,
      u.notifications_enabled,
      ST_Distance(u.current_location, d.deal_location) AS distance_meters
    FROM deals d
    JOIN users u
      ON ST_DWithin(u.current_location, d.deal_location, d.effective_radius_meters)
    WHERE d.id = ?
      AND u.location_consent = true
      AND u.notifications_enabled = true
      AND u.is_flagged = false
      AND u.role = 'consumer'
      AND u.location_updated_at > NOW() - INTERVAL '15 minutes'
    ORDER BY distance_meters ASC
  `, [dealId]);

  return result.rows;
}

/**
 * Find active deals within a user's current location (for HomeFeed).
 * Consumer-facing: returns deal details with distance and RUS.
 *
 * @param {string} userId
 * @param {number} [radiusMeters=5000] - optional max search radius override
 * @returns {Promise<Array>}
 */
async function findNearbyDealsForUser(userId, radiusMeters = 5000) {
  const result = await db.raw(`
    SELECT
      d.id,
      d.title,
      d.description,
      d.items,
      d.dietary_tags,
      d.current_price,
      d.original_price,
      d.min_rescue_price,
      d.total_quantity,
      d.claimed_quantity,
      d.total_quantity - d.claimed_quantity AS items_remaining,
      d.status,
      d.expires_at,
      d.urgency_score,
      d.urgency_label,
      d.image_url,
      v.business_name AS vendor_name,
      v.business_type AS vendor_type,
      ST_Distance(u.current_location, d.deal_location) AS distance_meters
    FROM users u
    JOIN deals d
      ON ST_DWithin(u.current_location, d.deal_location, ?)
    JOIN vendors v ON d.vendor_id = v.id
    WHERE u.id = ?
      AND d.status IN ('ACTIVE', 'PARTIALLY_CLAIMED')
      AND d.expires_at > NOW()
      AND u.location_updated_at > NOW() - INTERVAL '15 minutes'
    ORDER BY d.urgency_score DESC, distance_meters ASC
    LIMIT 50
  `, [radiusMeters, userId]);

  return result.rows;
}

/**
 * Get a single deal with full vendor info and distance from a user.
 *
 * @param {string} dealId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function getDealWithDistance(dealId, userId) {
  const result = await db.raw(`
    SELECT
      d.*,
      v.business_name AS vendor_name,
      v.business_type AS vendor_type,
      v.opening_time,
      v.closing_time,
      ST_Distance(u.current_location, d.deal_location) AS distance_meters,
      ST_X(d.deal_location::geometry) AS deal_lng,
      ST_Y(d.deal_location::geometry) AS deal_lat
    FROM deals d
    JOIN vendors v ON d.vendor_id = v.id
    JOIN users u ON u.id = ?
    WHERE d.id = ?
  `, [userId, dealId]);

  return result.rows[0] || null;
}

module.exports = {
  findEligibleConsumers,
  findNearbyDealsForUser,
  getDealWithDistance,
};
