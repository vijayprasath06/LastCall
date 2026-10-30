/**
 * Migration 06: Create vendor_analytics table
 *
 * Stores per-deal event records for vendor dashboards and platform-wide insights.
 * Key design decisions:
 * - deal_id: ON DELETE SET NULL prevents dangling FK after deal purge (24h post-expiry) [COMP-4]
 * - Snapshot columns (deal_title_snapshot, deal_price_snapshot) capture deal context
 *   at write time, so analytics survive the 24h deal data purge lifecycle [ARCH-1]
 * - Composite index (vendor_id, recorded_at DESC) optimizes vendor time-series dashboard [COMP-5]
 * - Anonymized aggregate data retained indefinitely for research insights [ARCH-1]
 */

exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE vendor_analytics (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id             UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,

      -- COMP-4 FIX: ON DELETE SET NULL prevents dangling FK after 24h deal purge.
      -- Snapshot columns below capture deal context at write time so analytics survive purge.
      deal_id               UUID REFERENCES deals(id) ON DELETE SET NULL,
      deal_title_snapshot   VARCHAR(200),          -- copied at write time from deals.title
      deal_price_snapshot   DECIMAL(10,2),         -- copied at write time from deals.original_price

      -- Event classification
      event_type            VARCHAR(50) NOT NULL,
      -- Values: 'deal_posted' | 'deal_claimed' | 'deal_expired' | 'deal_cancelled'
      --         | 'deal_ngo_handoff' | 'pickup_confirmed' | 'claim_released'

      -- Metrics per event
      items_rescued         INTEGER NOT NULL DEFAULT 0,
      revenue_amount        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      users_notified        INTEGER NOT NULL DEFAULT 0,  -- how many users received push on deal post
      claim_lag_secs        INTEGER,                    -- seconds from deal post to this claim event

      recorded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Index for vendor dashboard time-series queries
  await knex.raw(`
    CREATE INDEX idx_analytics_vendor
    ON vendor_analytics (vendor_id);
  `);

  // COMP-5 FIX: Composite index for vendor time-series dashboard
  // Covers: WHERE vendor_id = $1 ORDER BY recorded_at DESC
  await knex.raw(`
    CREATE INDEX idx_analytics_vendor_time
    ON vendor_analytics (vendor_id, recorded_at DESC);
  `);

  // Index for platform-wide analytics aggregations by event type
  await knex.raw(`
    CREATE INDEX idx_analytics_event_type
    ON vendor_analytics (event_type, recorded_at DESC);
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP TABLE IF EXISTS vendor_analytics CASCADE;');
};
