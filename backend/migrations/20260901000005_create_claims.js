/**
 * Migration 05: Create claims table
 *
 * Claims represent a consumer's reservation of a deal slot.
 * Key design decisions:
 * - ACID-safe: claimed via a single PostgreSQL CTE transaction [CRIT-2]
 * - qr_token: unique UUID generated per claim for vendor pickup verification
 * - qr_expires_at: LEAST(confirmed_at + 20min, deal.expires_at - 5min) [PROD-3]
 * - status: full claim state machine — PENDING → CONFIRMED → PICKED_UP | EXPIRED | CANCELLED
 * - CANCELLED carries no reliability penalty (voluntary); EXPIRED increments no_show_count [ARCH-6]
 * - Unique constraint (deal_id, user_id) prevents duplicate claims per user per deal
 */

exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE claims (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id         UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

      -- Claim State Machine [Section 6]
      -- PENDING → CONFIRMED (instant, as part of ACID claim transaction) [CRIT-2]
      -- CONFIRMED → PICKED_UP (vendor QR scan)
      -- CONFIRMED → EXPIRED (20-min timeout by Worker 2; no_show_count++)
      -- CONFIRMED → CANCELLED (voluntary by consumer; no penalty) [CRIT-4]
      status          VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED'
                      CHECK (status IN ('CONFIRMED', 'PICKED_UP', 'EXPIRED', 'CANCELLED')),

      -- QR Code for vendor pickup verification
      qr_token        TEXT UNIQUE NOT NULL,

      -- PROD-3 FIX: qr_expires_at = LEAST(NOW() + INTERVAL '20 minutes', deal.expires_at - INTERVAL '5 minutes')
      -- If vendor shortens deal expires_at, all CONFIRMED claims' qr_expires_at are recomputed.
      qr_expires_at   TIMESTAMPTZ NOT NULL,

      -- Timestamps (set progressively as status transitions occur)
      claimed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confirmed_at    TIMESTAMPTZ,   -- set immediately on CONFIRMED (same as claimed_at in v1)
      picked_up_at    TIMESTAMPTZ,   -- set when vendor scans QR
      expired_at      TIMESTAMPTZ,   -- set by Worker 2 on timeout no-show
      cancelled_at    TIMESTAMPTZ,   -- set on voluntary consumer cancellation [CRIT-4]

      -- Tracks whether pickup reminder push has already been sent [Worker 4]
      reminder_sent   BOOLEAN NOT NULL DEFAULT false,

      -- One claim per user per deal
      CONSTRAINT uq_claim_per_user_deal UNIQUE (deal_id, user_id)
    );
  `);

  // Index for deal dashboard queries (claims per deal)
  await knex.raw(`CREATE INDEX idx_claims_deal ON claims (deal_id);`);

  // Index for consumer "My Claims" page
  await knex.raw(`CREATE INDEX idx_claims_user ON claims (user_id);`);

  // Index for Worker 2 (claim timeout sweep)
  await knex.raw(`CREATE INDEX idx_claims_status ON claims (status);`);

  // Index for QR token lookup at vendor pickup scan
  await knex.raw(`CREATE INDEX idx_claims_qr ON claims (qr_token);`);

  // Index for QR expiry enforcement
  await knex.raw(`CREATE INDEX idx_claims_qr_expires ON claims (qr_expires_at);`);

  // Composite index: active confirmed claims per deal (for slot count queries)
  await knex.raw(`
    CREATE INDEX idx_claims_deal_confirmed
    ON claims (deal_id, status)
    WHERE status = 'CONFIRMED';
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP TABLE IF EXISTS claims CASCADE;');
};
