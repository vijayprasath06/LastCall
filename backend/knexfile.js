// Update this path to point to your .env file
require('dotenv').config({ path: '../.env' });

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: '127.0.0.1',
      port: 5432,
      database: 'egpp_db',
      user: 'egpp_user',
      password: 'egpp_pass',
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './seeds',
    },
  },
  
  test: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: '127.0.0.1',
      port: 5432,
      database: 'egpp_db',
      user: 'egpp_user',
      password: 'egpp_pass',
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './seeds',
    },
  },

  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './seeds',
    },
    pool: {
      min: 2,
      max: 10,
    },
  },
};
