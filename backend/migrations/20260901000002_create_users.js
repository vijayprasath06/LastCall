/**
 * Migration 02: Create users table
 *
 * Stores both consumers and vendors (differentiated by role).
 * Key design decisions:
 * - current_location: GEOGRAPHY(Point, 4326) — stores ONLY current snapshot, never history [PROD-6]
 * - date_of_birth: NOT NULL — server-side age gate enforcement ≥13 years [COMP-1]
 * - reliability_score: 0.00–1.00, recalculated after every claim outcome [ARCH-6]
 * - GIST index on current_location for efficient ST_DWithin spatial JOINs [CRIT-1]
 * - role: 'consumer' | 'vendor' | 'admin' — drives route-level access control
 */

exports.up = async function (knex) {
  // Create the users table using raw SQL to leverage PostGIS GEOGRAPHY type
  await knex.raw(`
    CREATE TABLE users (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                    VARCHAR(100) NOT NULL,
      email                   VARCHAR(255) UNIQUE,
      phone                   VARCHAR(20),
      password_hash           TEXT NOT NULL,

      -- Role-based access: 'consumer' | 'vendor' | 'admin'
      role                    VARCHAR(20) NOT NULL DEFAULT 'consumer'
                              CHECK (role IN ('consumer', 'vendor', 'admin')),

      -- COMP-1 FIX: Age gate enforced server-side via DOB.
      -- Server rejects registration if: date_of_birth > NOW() - INTERVAL '13 years'
      date_of_birth           DATE NOT NULL,

      -- Location: current snapshot only — no history stored [PROD-6]
      current_location        GEOGRAPHY(Point, 4326),
      location_updated_at     TIMESTAMPTZ,

      -- Push notification delivery channels
      fcm_token               TEXT,
      push_subscription       JSONB,
      notifications_enabled   BOOLEAN NOT NULL DEFAULT true,

      -- Privacy & compliance [DPDP / GDPR]
      location_consent        BOOLEAN NOT NULL DEFAULT false,
      location_consent_at     TIMESTAMPTZ,
      data_processing_consent BOOLEAN NOT NULL DEFAULT false,

      -- Consumer reputation (no-show tracking) [ARCH-6]
      -- Formula: reliability_score = successful_pickups / GREATEST(total_claims, 1)
      -- Range: 0.00–1.00 | Default: 1.00 | Recalculated after every claim outcome
      total_claims            INTEGER NOT NULL DEFAULT 0,
      successful_pickups      INTEGER NOT NULL DEFAULT 0,
      no_show_count           INTEGER NOT NULL DEFAULT 0,
      reliability_score       DECIMAL(3,2) NOT NULL DEFAULT 1.00,
      is_flagged              BOOLEAN NOT NULL DEFAULT false,  -- true after 3+ no-shows

      -- Email constraint: at least one of email or phone must be present
      -- Enforced at application layer via Zod validation
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // GIST spatial index on current_location — enables fast ST_DWithin JOIN [CRIT-1]
  await knex.raw(`
    CREATE INDEX idx_users_location
    ON users USING GIST (current_location);
  `);

  // Index on location_updated_at for stale-location freshness filter [ARCH-5]
  await knex.raw(`
    CREATE INDEX idx_users_location_updated
    ON users (location_updated_at);
  `);

  // Index for role-based queries (admin vendor list, etc.)
  await knex.raw(`
    CREATE INDEX idx_users_role ON users (role);
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP TABLE IF EXISTS users CASCADE;');
};
