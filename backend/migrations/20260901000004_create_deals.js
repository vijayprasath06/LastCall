/**
 * Migration 04: Create deals table
 *
 * Deals are the core data entity — each represents a vendor's surplus food listing.
 * Key design decisions:
 * - items: JSONB — stores exact, transparent inventory (NOT mystery bags) [Core Philosophy]
 * - Dutch Auction pricing: start_price → current_price → min_rescue_price over time
 * - deal_location: immutable snapshot of vendor's verified_location at post time
 * - effective_radius_meters: dynamically computed by RadiusEngine on deal creation
 * - status: strict state machine with defined transitions [Section 6]
 * - urgency_score: 5-factor composite Real-Time Urgency Score (RUS) [Section 10]
 * - GIST index on deal_location for all geospatial consumer-matching queries [CRIT-1]
 */

exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE deals (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id             UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,

      -- Transparent inventory (exact items, NOT mystery bags) [Core Philosophy]
      title                 VARCHAR(200) NOT NULL,
      description           TEXT,
      items                 JSONB NOT NULL,          -- [{ name, quantity, unit }]
      image_url             TEXT,
      dietary_tags          TEXT[],                  -- ['veg', 'vegan', 'contains_gluten', 'dairy']

      -- Dutch Auction Pricing Model [Core Philosophy]
      -- original_price, start_price, min_rescue_price: immutable after posting [PROD-4]
      original_price        DECIMAL(10,2) NOT NULL,
      start_price           DECIMAL(10,2) NOT NULL,
      current_price         DECIMAL(10,2) NOT NULL,
      min_rescue_price      DECIMAL(10,2) NOT NULL,
      next_price_drop_at    TIMESTAMPTZ,             -- scheduled by Worker 6

      -- Reserved for v2 in-app payments (Razorpay). Unused in v1. [PROD-5]
      platform_fee          DECIMAL(10,2),

      -- Inventory tracking (ACID-safe via CTE claim transaction) [CRIT-2]
      total_quantity        INTEGER NOT NULL DEFAULT 1,
      claimed_quantity      INTEGER NOT NULL DEFAULT 0,

      -- Deal State Machine [Section 6]
      -- ACTIVE → CLAIMED | PARTIALLY_CLAIMED | CANCELLED
      -- PARTIALLY_CLAIMED → ACTIVE (on claim timeout/release)
      -- ACTIVE (at T-15min, 0 claims) → NGO_HANDOFF
      -- ACTIVE | PARTIALLY_CLAIMED → EXPIRED (at expires_at)
      status                VARCHAR(25) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN (
                              'ACTIVE', 'CLAIMED', 'PARTIALLY_CLAIMED',
                              'EXPIRED', 'CANCELLED', 'NGO_HANDOFF'
                            )),

      -- Temporal TTL
      expires_at            TIMESTAMPTZ NOT NULL,
      posted_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      -- Immutable snapshot of vendor's verified_location at deal creation time
      -- Prevents location spoofing after deal is live
      deal_location         GEOGRAPHY(Point, 4326) NOT NULL,

      -- Dynamic push radius (meters), computed by RadiusEngine on deal creation [Section 9]
      -- Range: 500m (minimum) – 5000m (maximum)
      effective_radius_meters INTEGER NOT NULL DEFAULT 2000,

      -- Real-Time Urgency Score (RUS) [Section 10]
      -- 5-factor composite: Time Pressure, Scarcity, Claim Lag, Distance, Weather
      urgency_score         DECIMAL(4,2) NOT NULL DEFAULT 0.00,
      urgency_label         VARCHAR(20) NOT NULL DEFAULT 'COMFORTABLE'
                            CHECK (urgency_label IN ('GOING_NOW', 'ACT_SOON', 'COMFORTABLE')),
      rus_updated_at        TIMESTAMPTZ,

      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Index for status-based queries (active deal feeds, expiry sweeps)
  await knex.raw(`CREATE INDEX idx_deals_status ON deals (status);`);

  // Index for TTL sweep Worker 1 and NGO handoff Worker 7 scheduling
  await knex.raw(`CREATE INDEX idx_deals_expires ON deals (expires_at);`);

  // GIST spatial index — used by PostGIS ST_DWithin geofence matching query [CRIT-1]
  await knex.raw(`
    CREATE INDEX idx_deals_location ON deals USING GIST (deal_location);
  `);

  // Index for vendor dashboard queries
  await knex.raw(`CREATE INDEX idx_deals_vendor ON deals (vendor_id);`);

  // Composite index for active deal feeds ordered by urgency
  await knex.raw(`
    CREATE INDEX idx_deals_active_urgency
    ON deals (status, urgency_score DESC)
    WHERE status IN ('ACTIVE', 'PARTIALLY_CLAIMED');
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP TABLE IF EXISTS deals CASCADE;');
};
