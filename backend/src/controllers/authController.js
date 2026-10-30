/**
 * Auth Controller — Consumer & Vendor dual-role authentication [Phase 2]
 *
 * Endpoints:
 *   POST /api/auth/register  — register consumer or vendor
 *   POST /api/auth/login     — login, returns JWT access + refresh tokens
 *   POST /api/auth/refresh   — exchange refresh token for new access token
 *   POST /api/auth/logout    — revoke refresh + blacklist access token
 *
 * Security:
 *   - JWT access token (15m TTL) + refresh token (7d TTL, keyed by jti)
 *   - Redis refresh whitelist: SET refresh:{jti} {userId} EX 604800
 *   - Redis access blocklist:  SET blocklist:{jti} 1 EX 900 (on logout)
 *   - Age gate: server rejects DOB yielding age < 13 [COMP-1]
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { differenceInYears } = require('date-fns');
const { z } = require('zod');

const db = require('../config/db');
const redis = require('../config/redis');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateTokenPair(payload) {
  const jti = uuidv4(); // unique token ID for blocklist/whitelist keying

  const accessToken = jwt.sign(
    { ...payload, jti },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );

  const refreshJti = uuidv4();
  const refreshToken = jwt.sign(
    { id: payload.id, jti: refreshJti },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );

  return { accessToken, refreshToken, refreshJti, accessJti: jti };
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const consumerRegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().optional(),
  phone: z.string().min(10).max(20).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  data_processing_consent: z.literal(true, { errorMap: () => ({ message: 'You must consent to data processing' }) }),
}).refine((d) => d.email || d.phone, { message: 'Provide either email or phone' });

const vendorRegisterSchema = z.object({
  // Account credentials
  name: z.string().min(2).max(100),
  email: z.string().email().optional(),
  phone: z.string().min(10).max(20).optional(),
  password: z.string().min(8),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_processing_consent: z.literal(true),
  // Business profile
  business_name: z.string().min(2).max(200),
  business_type: z.string().max(100).optional(),
  verified_address: z.string().min(10),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().max(100).optional(),
  pincode: z.string().max(20).optional(),
  city_density_tier: z.enum(['metro', 'tier2', 'tier3']).default('tier2'),
  opening_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  closing_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
}).refine((d) => d.email || d.phone, { message: 'Provide either email or phone' });

const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(10).max(20).optional(),
  password: z.string().min(1),
}).refine((d) => d.email || d.phone, { message: 'Provide either email or phone' });

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Body: { role: 'consumer'|'vendor', ...fields }
 */
async function register(req, res, next) {
  try {
    const { role = 'consumer' } = req.body;

    if (!['consumer', 'vendor'].includes(role)) {
      return res.status(400).json({ error: 'role must be consumer or vendor' });
    }

    // Parse with the appropriate schema
    let data;
    try {
      data = role === 'vendor'
        ? vendorRegisterSchema.parse(req.body)
        : consumerRegisterSchema.parse(req.body);
    } catch (zodErr) {
      return res.status(400).json({
        error: 'Validation failed',
        details: zodErr.errors?.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    // COMP-1 FIX: Server-side age gate — reject if under 13
    const age = differenceInYears(new Date(), new Date(data.date_of_birth));
    if (age < 13) {
      return res.status(403).json({ error: 'Must be at least 13 years old to register', code: 'AGE_GATE' });
    }

    // Check email/phone uniqueness
    const existing = await db('users')
      .where(data.email ? { email: data.email } : { phone: data.phone })
      .first();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email/phone already exists' });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    // ── Consumer registration ──────────────────────────────────────────────
    if (role === 'consumer') {
      const [user] = await db('users')
        .insert({
          id: uuidv4(),
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          password_hash: passwordHash,
          role: 'consumer',
          date_of_birth: data.date_of_birth,
          data_processing_consent: true,
        })
        .returning(['id', 'name', 'email', 'phone', 'role']);

      const newUser = {
        id: user.id, name: user.name, email: user.email, phone: user.phone, role: 'consumer', vendorId: null,
      };
      const { accessToken, refreshToken, refreshJti } = generateTokenPair(newUser);
      const refreshTTL = 7 * 24 * 60 * 60;
      await redis.set(`refresh:${refreshJti}`, user.id, 'EX', refreshTTL);

      return res.status(201).json({
        message: 'Consumer account created successfully',
        accessToken,
        refreshToken,
        user: newUser,
      });
    }

    // ── Vendor registration (atomic: users + vendors) ──────────────────────
    const vendorId = uuidv4();
    const userId = uuidv4();

    await db.transaction(async (trx) => {
      // 1. Create user record
      await trx.raw(`
        INSERT INTO users (id, name, email, phone, password_hash, role, date_of_birth, data_processing_consent)
        VALUES (?, ?, ?, ?, ?, 'vendor', ?, true)
      `, [userId, data.name, data.email || null, data.phone || null, passwordHash, data.date_of_birth]);

      // 2. Create vendor profile with PostGIS location
      await trx.raw(`
        INSERT INTO vendors (
          id, user_id, business_name, business_type,
          verified_address, verified_location, city, pincode, city_density_tier,
          opening_time, closing_time
        )
        VALUES (
          ?, ?, ?, ?,
          ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?, ?,
          ?, ?
        )
      `, [
        vendorId, userId, data.business_name, data.business_type || null,
        data.verified_address, data.longitude, data.latitude,
        data.city || null, data.pincode || null, data.city_density_tier,
        data.opening_time || null, data.closing_time || null,
      ]);
    });

    return res.status(201).json({
      message: 'Vendor account created. Awaiting admin verification before posting deals.',
      user: { id: userId, name: data.name, email: data.email, phone: data.phone, role: 'vendor' },
      vendor: { id: vendorId, business_name: data.business_name, is_verified: false },
    });

  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Body: { email?, phone?, password }
 * Returns: { accessToken, refreshToken, user: { id, name, role, vendorId? } }
 * Smart redirect hint: role tells frontend where to navigate
 */
async function login(req, res, next) {
  try {
    let data;
    try {
      data = loginSchema.parse(req.body);
    } catch (zodErr) {
      return res.status(400).json({ error: 'Validation failed', details: zodErr.errors });
    }

    // Find user by email or phone
    const user = await db('users')
      .where(data.email ? { email: data.email } : { phone: data.phone })
      .first();

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(data.password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Fetch vendorId if vendor role
    let vendorId = null;
    if (user.role === 'vendor') {
      const vendor = await db('vendors').where({ user_id: user.id }).first('id');
      vendorId = vendor?.id || null;
    }

    // Generate JWT pair
    const payload = { id: user.id, role: user.role, vendorId };
    const { accessToken, refreshToken, refreshJti } = generateTokenPair(payload);

    // Store refresh token in Redis whitelist [ARCH-7]
    const refreshTTL = 7 * 24 * 60 * 60; // 7 days in seconds
    await redis.set(`refresh:${refreshJti}`, user.id, 'EX', refreshTTL);

    return res.status(200).json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,       // frontend uses this for smart redirect
        vendorId,
        is_flagged: user.is_flagged,
        reliability_score: user.reliability_score,
      },
    });

  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 * Returns: { accessToken }
 */
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Check Redis whitelist — token must exist [ARCH-7]
    const storedUserId = await redis.get(`refresh:${decoded.jti}`);
    if (!storedUserId) {
      return res.status(401).json({ error: 'Refresh token revoked or expired', code: 'TOKEN_REVOKED' });
    }

    // Load user for fresh role/vendorId
    const user = await db('users').where({ id: storedUserId }).first();
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    let vendorId = null;
    if (user.role === 'vendor') {
      const vendor = await db('vendors').where({ user_id: user.id }).first('id');
      vendorId = vendor?.id || null;
    }

    const payload = { id: user.id, role: user.role, vendorId };
    const { accessToken, refreshToken: newRefreshToken, refreshJti: newJti } = generateTokenPair(payload);

    // Rotate: delete old refresh token, store new one
    await redis.del(`refresh:${decoded.jti}`);
    await redis.set(`refresh:${newJti}`, user.id, 'EX', 7 * 24 * 60 * 60);

    return res.status(200).json({ accessToken, refreshToken: newRefreshToken });

  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Header: Authorization: Bearer <accessToken>
 * Body: { refreshToken }
 */
async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;

    // Revoke refresh token from whitelist
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        await redis.del(`refresh:${decoded.jti}`);
      } catch {
        // Ignore expired/invalid refresh tokens on logout
      }
    }

    // Blacklist the current access token for the remainder of its TTL [ARCH-7]
    if (req.user?.jti) {
      const exp = req.user.exp;
      const ttl = Math.max(0, exp - Math.floor(Date.now() / 1000));
      if (ttl > 0) {
        await redis.set(`blocklist:${req.user.jti}`, '1', 'EX', ttl);
      }
    }

    return res.status(200).json({ message: 'Logged out successfully' });

  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refresh, logout };
