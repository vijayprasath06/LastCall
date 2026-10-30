/**
 * Server entrypoint — starts HTTP server and initializes all background workers
 */

require('dotenv').config();

const app = require('./app');

// Initialize connections (side effects on require)
require('./config/db');
require('./config/redis');

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`\n🚀 EGPP Backend running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}\n`);

  // ─── BUG FIX: Start all BullMQ/cron background workers ─────────────────────
  // Workers self-register their cron jobs on require(). They MUST be required
  // AFTER the server binds so DB/Redis connections are ready.
  require('./workers/dealExpiryWorker');    // Worker 1: Deal TTL sweep (every 2 min)
  require('./workers/claimTimeoutWorker');  // Worker 2: Claim 20-min timeout (every 1 min)
  require('./workers/rusWorker');           // Worker 3: RUS recalculation (every 5 min)
  require('./workers/reminderWorker');      // Worker 4: Pickup reminder (10-min delayed)
  require('./workers/weatherWorker');       // Worker 5: Weather cache refresh (every 30 min)
  require('./workers/priceDroppingWorker'); // Worker 6: Dutch Auction price drops
  require('./workers/ngoHandoffWorker');    // Worker 7: Guarded NGO handoff (every 1 min)
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received — shutting down gracefully...');
  server.close(() => process.exit(0));
});

module.exports = server;
