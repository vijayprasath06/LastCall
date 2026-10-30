/**
 * Migration 01: Enable PostGIS Extension
 * PostGIS is required for all GEOGRAPHY(Point, 4326) columns and
 * spatial queries like ST_DWithin, ST_Distance, ST_MakePoint.
 */

exports.up = async function (knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "postgis";');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
};

exports.down = async function (knex) {
  // Note: Dropping PostGIS in production is destructive.
  // Only done in test/dev environments.
  await knex.raw('DROP EXTENSION IF EXISTS "postgis" CASCADE;');
  await knex.raw('DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;');
};
