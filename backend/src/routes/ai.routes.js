/**
 * AI Routes — /api/ai/*
 *
 * POST /api/ai/snap-to-post  — Snap-to-Post image upload → ViT classification + pricing
 * GET  /api/ai/taxonomy      — Returns food category & dietary tag list for vendor form
 *
 * All AI routes are vendor-only [ARCH-2].
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { upload, snapToPost, getTaxonomy } = require('../controllers/aiController');

// POST /api/ai/snap-to-post
// multer handles multipart file parsing; field name must be "image"
router.post(
  '/snap-to-post',
  authenticateJWT,
  requireRole('vendor'),
  upload.single('image'),
  snapToPost
);

// GET /api/ai/taxonomy — food category dropdown data
router.get('/taxonomy', authenticateJWT, requireRole('vendor'), getTaxonomy);

module.exports = router;
