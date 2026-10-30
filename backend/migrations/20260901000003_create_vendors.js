/**
 * Migration 03: Create vendors table
 *
 * Vendor profiles are linked to users via user_id (role = 'vendor').
 * Key design decisions:
 * - verified_location: PostGIS GEOGRAPHY(Point, 4326) — immutable after admin approval [ARCH-8]
 * - city_density_tier: 'metro' | 'tier2' | 'tier3' — drives dynamic radius multiplier [PROD-1]
 * - is_verified: admin must approve before first deal can be posted
 * - avg_claim_lag_secs: used as Factor 3 (F3) in Real-Time Urgency Score (RUS) calculation
 * - GIST index on verified_location for geospatial queries
 */

exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE vendors (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

      business_name           VARCHAR(200) NOT NULL,
      business_type           VARCHAR(100),  -- e.g. 'bakery', 'restaurant', 'cafe', 'sweet_shop'

      -- Verified, locked store address (immutable after admin onboarding approval) [ARCH-8]
      -- Set via Nominatim OpenStreetMap geocoding — no paid Mapbox dependency
      verified_address        TEXT NOT NULL,
      verified_location       GEOGRAPHY(Point, 4326) NOT NULL,
      city                    VARCHAR(100),
      pincode                 VARCHAR(20),

      -- City density tier drives dynamic radius multiplier [RadiusEngine]:
      -- metro: base * 0.6 | tier2: base * 1.0 | tier3: base * 1.8
      city_density_tier       VARCHAR(20) NOT NULL DEFAULT 'tier2'
                              CHECK (city_density_tier IN ('metro', 'tier2', 'tier3')),

      -- Admin verification — vendor cannot post deals until is_verified = true
      is_verified             BOOLEAN NOT NULL DEFAULT false,
      verification_method     VARCHAR(50),  -- 'manual_review' | 'document_check'
      verified_at             TIMESTAMPTZ,

      -- Business operating hours
      opening_time            TIME,
      closing_time            TIME,

      -- Branding
      logo_url                TEXT,
      cover_image_url         TEXT,

      -- Aggregate analytics (updated after each deal lifecycle)
      total_deals_posted      INTEGER NOT NULL DEFAULT 0,
      total_items_rescued     INTEGER NOT NULL DEFAULT 0,
      total_revenue_recovered DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      avg_claim_rate          DECIMAL(5,2) NOT NULL DEFAULT 0.00,  -- % of items claimed across all deals

      -- Average seconds from deal post to first claim (used in RUS Factor 3 calculation)
      avg_claim_lag_secs      INTEGER NOT NULL DEFAULT 600,

      -- Subscription tier for platform revenue model [PROD-5]
      -- 'starter' (free) | 'rescue_partner' (Rs.499/mo) | 'chain' (Rs.1999/mo)
      subscription_tier       VARCHAR(30) NOT NULL DEFAULT 'starter'
                              CHECK (subscription_tier IN ('starter', 'rescue_partner', 'chain')),

      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // GIST spatial index on verified_location
  await knex.raw(`
    CREATE INDEX idx_vendors_location
    ON vendors USING GIST (verified_location);
  `);

  // Index for admin verification queue lookups
  await knex.raw(`
    CREATE INDEX idx_vendors_verified ON vendors (is_verified);
  `);

  // Unique: one vendor profile per user account
  await knex.raw(`
    CREATE UNIQUE INDEX idx_vendors_user_id ON vendors (user_id);
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP TABLE IF EXISTS vendors CASCADE;');
};
