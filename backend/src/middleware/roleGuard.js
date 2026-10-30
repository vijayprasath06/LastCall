/**
 * Role Guard Middleware — Role-Based Access Control (RBAC)
 *
 * Protects routes from users with insufficient roles.
 * Must be used AFTER authenticateJWT middleware.
 *
 * Role hierarchy:
 *   'consumer' — can claim deals, manage own profile
 *   'vendor'   — can post deals, use AI Snap-to-Post, verify QR pickups
 *   'admin'    — can verify vendors, manage NGO DPA allowlist
 *
 * Usage:
 *   router.post('/deals', authenticateJWT, requireRole('vendor'), handler);
 *   router.post('/deals/:id/claim', authenticateJWT, requireRole('consumer'), handler);
 *
 * Conflict-of-interest protection:
 *   Vendors CANNOT claim deals (requireRole('consumer') blocks them)
 *   Consumers CANNOT post deals or access AI tools (requireRole('vendor') blocks them)
 */

/**
 * Factory: returns middleware that enforces the specified role.
 * @param {...string} roles - One or more allowed roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`,
        code: 'INSUFFICIENT_ROLE',
      });
    }

    next();
  };
}

/**
 * Middleware: only allows the vendor to access their own vendor resources.
 * Ensures vendor A cannot access vendor B's dashboard or deals.
 * Used alongside requireRole('vendor').
 *
 * Requires req.params.vendorId or req.params.id to match req.user.vendorId.
 */
function requireOwnVendor(req, res, next) {
  const paramVendorId = req.params.vendorId || req.params.id;
  if (req.user.role === 'admin') return next(); // admins can access any vendor
  if (req.user.vendorId !== paramVendorId) {
    return res.status(403).json({ error: 'Access denied: not your vendor profile', code: 'VENDOR_MISMATCH' });
  }
  next();
}

module.exports = { requireRole, requireOwnVendor };
