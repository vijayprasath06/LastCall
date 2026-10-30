/**
 * Admin Controller — Phase 10 [ARCH-3]
 *
 * Admin-only routes for platform governance:
 *
 * GET    /api/admin/vendors/pending       — list vendors awaiting approval
 * POST   /api/admin/vendors/:id/approve   — approve a vendor
 * POST   /api/admin/vendors/:id/reject    — reject a vendor
 * GET    /api/admin/users                 — list users (with filter by flagged)
 * POST   /api/admin/users/:id/unflag      — clear a consumer's is_flagged status
 *
 * NGO DPA Allowlist [CRIT-3, PROD-6]:
 * GET    /api/admin/ngos                  — list NGO partners
 * POST   /api/admin/ngos                  — register a new NGO partner
 * PATCH  /api/admin/ngos/:id              — update NGO (approve/deactivate)
 * DELETE /api/admin/ngos/:id              — remove NGO from allowlist
 *
 * Platform Stats:
 * GET    /api/admin/stats                 — platform-wide aggregate metrics
 *
 * All routes require role = 'admin' enforced by roleGuard middleware upstream.
 */

const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');

// ─── Validation Schemas ───────────────────────────────────────────────────────

const ngoSchema = z.object({
  name: z.string().min(2).max(200),
  webhook_url: z.string().url(),
  contact_email: z.string().email(),
  dpa_agreement_signed: z.boolean(),
});

// ─── Vendor Approval ──────────────────────────────────────────────────────────

/**
 * GET /api/admin/vendors/pending
 * Returns vendors awaiting admin approval.
 */
async function getPendingVendors(req, res, next) {
  try {
    const vendors = await db('vendors')
      .join('users', 'vendors.user_id', 'users.id')
      .where({ 'vendors.is_verified': false })
      .select([
        'vendors.id AS vendor_id',
        'vendors.business_name', 'vendors.business_type',
        'vendors.verified_address', 'vendors.city_density_tier',
        'vendors.created_at AS applied_at',
        'users.name AS owner_name', 'users.email', 'users.phone',
      ])
      .orderBy('vendors.created_at', 'asc');

    return res.status(200).json({ vendors, count: vendors.length });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/vendors/:id/approve
 * Marks vendor as verified — allows them to post deals.
 */
async function approveVendor(req, res, next) {
  try {
    const { id } = req.params;

    const updated = await db('vendors')
      .where({ id, is_verified: false })
      .update({ is_verified: true, verified_at: new Date(), updated_at: new Date() });

    if (updated === 0) {
      return res.status(404).json({ error: 'Vendor not found or already approved' });
    }

    console.log(`[Admin] Vendor approved: ${id}`);
    return res.status(200).json({ message: 'Vendor approved successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/vendors/:id/reject
 * Flags vendor with rejection reason; does not delete the record.
 */
async function rejectVendor(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const updated = await db('vendors')
      .where({ id })
      .update({
        is_verified: false,
        rejection_reason: reason || 'Rejected by admin',
        updated_at: new Date(),
      });

    if (updated === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    return res.status(200).json({ message: 'Vendor application rejected' });
  } catch (err) {
    next(err);
  }
}

// ─── User Management ──────────────────────────────────────────────────────────

/**
 * GET /api/admin/users?flagged=true
 * Lists users, optionally filtered to flagged accounts.
 */
async function listUsers(req, res, next) {
  try {
    const { flagged, page = 1, limit = 50 } = req.query;

    let query = db('users').select([
      'id', 'name', 'email', 'phone', 'role',
      'reliability_score', 'no_show_count', 'total_claims',
      'successful_pickups', 'is_flagged', 'created_at',
    ]);

    if (flagged === 'true') {
      query = query.where({ is_flagged: true });
    }

    const users = await query
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit))
      .offset((parseInt(page) - 1) * parseInt(limit));

    return res.status(200).json({ users, count: users.length });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/users/:id/unflag
 * Clears is_flagged on a consumer account after admin review.
 */
async function unflagUser(req, res, next) {
  try {
    const { id } = req.params;

    const updated = await db('users').where({ id, is_flagged: true }).update({
      is_flagged: false,
      no_show_count: 0,
      updated_at: new Date(),
    });

    if (updated === 0) {
      return res.status(404).json({ error: 'User not found or not currently flagged' });
    }

    return res.status(200).json({ message: 'User account unflagged and no-show count reset' });
  } catch (err) {
    next(err);
  }
}

// ─── NGO DPA Allowlist ────────────────────────────────────────────────────────

/**
 * GET /api/admin/ngos
 * Returns full NGO partner list for admin review.
 */
async function listNGOs(req, res, next) {
  try {
    const ngos = await db('ngo_partners')
      .select(['id', 'name', 'webhook_url', 'contact_email', 'is_approved', 'is_active', 'dpa_agreement_signed', 'created_at'])
      .orderBy('name');

    return res.status(200).json({ ngos });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/ngos
 * Registers a new NGO partner on the DPA allowlist [CRIT-3].
 */
async function createNGO(req, res, next) {
  try {
    let data;
    try {
      data = ngoSchema.parse(req.body);
    } catch (zodErr) {
      return res.status(400).json({ error: 'Validation failed', details: zodErr.errors });
    }

    if (!data.dpa_agreement_signed) {
      return res.status(400).json({ error: 'DPA agreement must be signed before registration', code: 'DPA_REQUIRED' });
    }

    const id = uuidv4();
    await db('ngo_partners').insert({
      id,
      name: data.name,
      webhook_url: data.webhook_url,
      contact_email: data.contact_email,
      dpa_agreement_signed: data.dpa_agreement_signed,
      is_approved: false, // Admin must explicitly approve after creation
      is_active: false,
    });

    return res.status(201).json({ message: 'NGO partner registered. Admin approval required to activate.', id });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/ngos/:id
 * Update NGO record — approve or deactivate.
 */
async function updateNGO(req, res, next) {
  try {
    const { id } = req.params;
    const { is_approved, is_active, webhook_url } = req.body;

    const updates = { updated_at: new Date() };
    if (typeof is_approved === 'boolean') updates.is_approved = is_approved;
    if (typeof is_active === 'boolean')   updates.is_active = is_active;
    if (webhook_url)                       updates.webhook_url = webhook_url;

    const updated = await db('ngo_partners').where({ id }).update(updates);
    if (updated === 0) return res.status(404).json({ error: 'NGO not found' });

    return res.status(200).json({ message: 'NGO updated' });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/ngos/:id
 * Removes an NGO from the allowlist — they will no longer receive webhooks.
 */
async function deleteNGO(req, res, next) {
  try {
    const { id } = req.params;
    const deleted = await db('ngo_partners').where({ id }).delete();
    if (deleted === 0) return res.status(404).json({ error: 'NGO not found' });

    return res.status(200).json({ message: 'NGO removed from allowlist' });
  } catch (err) {
    next(err);
  }
}

// ─── Platform Stats ───────────────────────────────────────────────────────────

/**
 * GET /api/admin/stats
 * Aggregate platform-wide metrics for admin dashboard.
 */
async function getPlatformStats(req, res, next) {
  try {
    const [
      usersStats,
      vendorStats,
      dealStats,
      claimStats,
      analyticsStats,
    ] = await Promise.all([
      // Total / flagged users
      db('users').select(
        db.raw('COUNT(*) AS total_users'),
        db.raw("COUNT(*) FILTER (WHERE role = 'consumer') AS total_consumers"),
        db.raw("COUNT(*) FILTER (WHERE role = 'vendor') AS total_vendors"),
        db.raw('COUNT(*) FILTER (WHERE is_flagged = true) AS flagged_users'),
      ).first(),

      // Vendor approval pipeline
      db('vendors').select(
        db.raw('COUNT(*) AS total_vendors'),
        db.raw('COUNT(*) FILTER (WHERE is_verified = true) AS verified_vendors'),
        db.raw('COUNT(*) FILTER (WHERE is_verified = false) AS pending_vendors'),
      ).first(),

      // Deal status breakdown
      db('deals').select(
        db.raw('COUNT(*) AS total_deals'),
        db.raw("COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_deals"),
        db.raw("COUNT(*) FILTER (WHERE status = 'CLAIMED') AS fully_claimed"),
        db.raw("COUNT(*) FILTER (WHERE status = 'NGO_HANDOFF') AS ngo_handoffs"),
        db.raw("COUNT(*) FILTER (WHERE status = 'EXPIRED') AS expired"),
      ).first(),

      // Claim summary
      db('claims').select(
        db.raw('COUNT(*) AS total_claims'),
        db.raw("COUNT(*) FILTER (WHERE status = 'PICKED_UP') AS successful_pickups"),
        db.raw("COUNT(*) FILTER (WHERE status = 'EXPIRED') AS no_shows"),
        db.raw("COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancellations"),
      ).first(),

      // Food rescue aggregate
      db('vendor_analytics').select(
        db.raw('SUM(items_rescued) AS total_items_rescued'),
        db.raw('SUM(revenue_amount) AS total_revenue_recovered'),
      ).first(),
    ]);

    return res.status(200).json({
      users: usersStats,
      vendors: vendorStats,
      deals: dealStats,
      claims: claimStats,
      impact: analyticsStats,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Vendor
  getPendingVendors,
  approveVendor,
  rejectVendor,
  // Users
  listUsers,
  unflagUser,
  // NGO
  listNGOs,
  createNGO,
  updateNGO,
  deleteNGO,
  // Stats
  getPlatformStats,
};
