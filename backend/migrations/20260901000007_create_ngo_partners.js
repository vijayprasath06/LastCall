/**
 * Migration 07: Create ngo_partners table
 *
 * Stores the DPA-approved NGO partner allowlist used by Worker 7
 * (ngoHandoffWorker.js) to decide which NGOs receive deal:ngo_handoff webhooks.
 *
 * CRIT-3: Only NGOs with is_approved = true AND is_active = true
 * receive webhook payloads. No user personal data is included.
 */

exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE ngo_partners (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                  VARCHAR(200) NOT NULL,
      contact_email         VARCHAR(255) NOT NULL,
      webhook_url           TEXT NOT NULL,
      dpa_agreement_signed  BOOLEAN NOT NULL DEFAULT false,
      is_approved           BOOLEAN NOT NULL DEFAULT false,
      is_active             BOOLEAN NOT NULL DEFAULT false,
      admin_notes           TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await knex.raw(`
    CREATE INDEX idx_ngo_partners_active
    ON ngo_partners (is_approved, is_active)
    WHERE is_approved = true AND is_active = true;
  `);
};

exports.down = async function (knex) {
  await knex.raw('DROP TABLE IF EXISTS ngo_partners CASCADE;');
};
