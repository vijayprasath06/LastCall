/**
 * Admin Routes — /api/admin/*
 *
 * All routes require JWT authentication + role = 'admin'.
 *
 * Vendor approval:
 *   GET    /api/admin/vendors/pending       — list unapproved vendors
 *   POST   /api/admin/vendors/:id/approve   — approve a vendor
 *   POST   /api/admin/vendors/:id/reject    — reject a vendor
 *
 * User management:
 *   GET    /api/admin/users                 — list users (filter ?flagged=true)
 *   POST   /api/admin/users/:id/unflag      — clear flagged account
 *
 * NGO DPA Allowlist:
 *   GET    /api/admin/ngos                  — list NGO partners
 *   POST   /api/admin/ngos                  — register NGO
 *   PATCH  /api/admin/ngos/:id              — approve / deactivate NGO
 *   DELETE /api/admin/ngos/:id              — remove NGO
 *
 * Platform stats:
 *   GET    /api/admin/stats                 — aggregate platform metrics
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const {
  getPendingVendors,
  approveVendor,
  rejectVendor,
  listUsers,
  unflagUser,
  listNGOs,
  createNGO,
  updateNGO,
  deleteNGO,
  getPlatformStats,
} = require('../controllers/adminController');

// All admin routes require admin role
const adminAuth = [authenticateJWT, requireRole('admin')];

// ── Vendor Approval ────────────────────────────────────────────────────────────
router.get('/vendors/pending',       ...adminAuth, getPendingVendors);
router.post('/vendors/:id/approve',  ...adminAuth, approveVendor);
router.post('/vendors/:id/reject',   ...adminAuth, rejectVendor);

// ── User Management ────────────────────────────────────────────────────────────
router.get('/users',                 ...adminAuth, listUsers);
router.post('/users/:id/unflag',     ...adminAuth, unflagUser);

// ── NGO DPA Allowlist ──────────────────────────────────────────────────────────
router.get('/ngos',                  ...adminAuth, listNGOs);
router.post('/ngos',                 ...adminAuth, createNGO);
router.patch('/ngos/:id',            ...adminAuth, updateNGO);
router.delete('/ngos/:id',           ...adminAuth, deleteNGO);

// ── Platform Stats ─────────────────────────────────────────────────────────────
router.get('/stats',                 ...adminAuth, getPlatformStats);

module.exports = router;
