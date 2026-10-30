/**
 * Express application — EGPP Zero-Waste Food Rescue Platform
 *
 * Middleware stack, route mounting, error handling.
 * SSE routes use a separate handler to bypass body parsing.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// ─── Routes ──────────────────────────────────────────────────────────────────
const authRoutes     = require('./routes/auth.routes');
const userRoutes     = require('./routes/user.routes');
const dealRoutes     = require('./routes/deal.routes');
const claimRoutes    = require('./routes/claim.routes');
const vendorRoutes   = require('./routes/vendor.routes');
const aiRoutes       = require('./routes/ai.routes');
const sseRoutes      = require('./routes/sse.routes');
const adminRoutes    = require('./routes/admin.routes');

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ─── Request Logging ──────────────────────────────────────────────────────────
app.use(morgan('dev'));

// ─── Body Parsing (not applied to SSE routes) ─────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'egpp-backend' });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/deals',    dealRoutes);
app.use('/api/deals',    claimRoutes);   // /api/deals/:id/claim, /api/deals/:id/claim/cancel
app.use('/api/vendor',   vendorRoutes);
app.use('/api/ai',       aiRoutes);
app.use('/api/sse',      sseRoutes);     // SSE: no body parser needed
app.use('/api/admin',    adminRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

module.exports = app;
