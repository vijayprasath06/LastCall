/**
 * Database connection — Knex.js query builder wrapping PostgreSQL + PostGIS
 *
 * Uses the same knexfile.js config but exposes a ready-to-use
 * knex instance for all queries across controllers, services, and workers.
 */

const knex = require('knex');
const knexConfig = require('../../knexfile');

const env = process.env.NODE_ENV || 'development';

const db = knex(knexConfig[env]);

// Test connection on startup
db.raw('SELECT 1')
  .then(() => console.log('✅ PostgreSQL connected'))
  .catch((err) => {
    console.error('❌ PostgreSQL connection failed:', err.message);
    process.exit(1);
  });

module.exports = db;
