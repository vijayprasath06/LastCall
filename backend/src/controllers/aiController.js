/**
 * AI Controller — Phase 7 [ARCH-2]
 *
 * POST /api/ai/snap-to-post — Snap-to-Post Vision AI bridge with circuit breaker
 *
 * Flow:
 *   1. Vendor uploads food image (multipart form via multer).
 *   2. Image is uploaded to Cloudinary CDN, returning a secure URL.
 *   3. Node.js proxies the Cloudinary URL to the Python FastAPI AI microservice.
 *   4. The AI service runs Hugging Face ViT inference and returns:
 *        { predictions, food_category, dietary_tags, suggested_prices }
 *   5. If the AI call times out (> 2000ms) OR fails, falls back to
 *      deterministic rule-based pricing table [ARCH-2 circuit breaker].
 *
 * GET /api/ai/taxonomy — returns the food taxonomy table (categories + tags)
 *   Used by the vendor's PostDeal form to populate dropdown options without
 *   an image scan.
 */

const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const db = require('../config/db');

// ─── Cloudinary Configuration ─────────────────────────────────────────────────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Multer — memory storage (no disk writes) ─────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are accepted'));
    }
  },
});

// ─── Deterministic Fallback Pricing Table [ARCH-2] ───────────────────────────

/**
 * Rule-based fallback when the AI microservice is unavailable or slow.
 * Maps broad food categories to safe INR price brackets.
 */
const FALLBACK_PRICING = {
  bakery:   { start_price: 60,  min_rescue_price: 30  },
  rice:     { start_price: 120, min_rescue_price: 60  },
  bread:    { start_price: 50,  min_rescue_price: 25  },
  snack:    { start_price: 80,  min_rescue_price: 40  },
  dessert:  { start_price: 100, min_rescue_price: 50  },
  beverage: { start_price: 40,  min_rescue_price: 20  },
  meal:     { start_price: 150, min_rescue_price: 80  },
  default:  { start_price: 100, min_rescue_price: 50  },
};

function getFallbackPricing(category = 'default') {
  const key = Object.keys(FALLBACK_PRICING).find((k) =>
    category.toLowerCase().includes(k)
  ) || 'default';
  return FALLBACK_PRICING[key];
}

// ─── AI Microservice Request with Timeout (Circuit Breaker) ──────────────────

/**
 * Calls the Python FastAPI AI microservice with a 2000ms timeout.
 * Returns null on failure — caller falls back to rule table.
 * @param {string} imageUrl — Cloudinary CDN URL
 * @returns {Promise<object|null>}
 */
async function callAIMicroservice(imageUrl) {
  const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000); // [ARCH-2] 2000ms circuit breaker

  try {
    const response = await fetch(`${AI_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[AI] Microservice returned HTTP ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.warn('[AI] Circuit breaker triggered — AI service exceeded 2000ms timeout');
    } else {
      console.error('[AI] Microservice call failed:', err.message);
    }
    return null;
  }
}

// ─── Cloudinary Upload ────────────────────────────────────────────────────────

/**
 * Uploads a buffer to Cloudinary and returns the secure CDN URL.
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {Promise<string>} secure_url
 */
function uploadToCloudinary(buffer, mimeType) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'egpp/food-snaps',
        resource_type: 'image',
        format: 'webp',         // Convert to WebP for optimal CDN delivery
        quality: 'auto',
        fetch_format: 'auto',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
}

// ─── POST /api/ai/snap-to-post ────────────────────────────────────────────────

/**
 * Main Snap-to-Post endpoint.
 * Returns AI classification result OR deterministic fallback.
 * Response shape is identical in both cases so the frontend never needs
 * to branch on whether AI was used.
 */
async function snapToPost(req, res, next) {
  try {
    // Validate file presence (multer already ran)
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided. Include it as form-data field "image".' });
    }

    // 1. Upload to Cloudinary
    let imageUrl;
    try {
      imageUrl = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    } catch (err) {
      console.error('[AI] Cloudinary upload failed:', err.message);
      return res.status(502).json({ error: 'Image upload failed', detail: err.message });
    }

    // 2. Call AI microservice with 2000ms circuit breaker
    let aiResult = await callAIMicroservice(imageUrl);
    let usedFallback = false;

    // 3. If AI failed or timed out, apply deterministic fallback [ARCH-2]
    if (!aiResult) {
      usedFallback = true;
      aiResult = {
        predictions: [],
        food_label: 'Unknown Food Item',
        food_category: 'default',
        dietary_tags: [],
        confidence: 0,
        suggested_prices: getFallbackPricing('default'),
      };
    } else if (aiResult.confidence < 0.50) {
      // Low-confidence — enrich with fallback pricing but keep AI labels
      aiResult.suggested_prices = aiResult.suggested_prices || getFallbackPricing(aiResult.food_category);
      aiResult.requires_manual_confirmation = true;
    }

    return res.status(200).json({
      image_url: imageUrl,
      food_label: aiResult.food_label,
      food_category: aiResult.food_category,
      dietary_tags: aiResult.dietary_tags,
      confidence: aiResult.confidence,
      predictions: aiResult.predictions,
      suggested_prices: aiResult.suggested_prices,
      requires_manual_confirmation: aiResult.requires_manual_confirmation ?? false,
      ai_used: !usedFallback,
      _fallback_reason: usedFallback ? 'AI service unavailable or timed out — using rule-based pricing' : undefined,
    });

  } catch (err) {
    next(err);
  }
}

// ─── GET /api/ai/taxonomy ─────────────────────────────────────────────────────

/**
 * Returns the flat food taxonomy for the vendor PostDeal form dropdown.
 * Proxied from the Python AI service, with a static fallback.
 */
async function getTaxonomy(req, res, next) {
  try {
    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    let taxonomy = null;

    try {
      const response = await fetch(`${AI_SERVICE_URL}/taxonomy`, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) taxonomy = await response.json();
    } catch {
      clearTimeout(timeout);
    }

    // Static fallback taxonomy if AI service is down
    if (!taxonomy) {
      taxonomy = {
        categories: [
          { id: 'bakery',   label: 'Bakery / Bread', tags: ['veg'] },
          { id: 'rice',     label: 'Rice / Biryani', tags: ['veg', 'non-veg'] },
          { id: 'snack',    label: 'Snacks / Street Food', tags: ['veg', 'vegan'] },
          { id: 'dessert',  label: 'Desserts / Sweets', tags: ['veg', 'dairy'] },
          { id: 'meal',     label: 'Full Meal / Thali', tags: ['veg', 'non-veg'] },
          { id: 'beverage', label: 'Beverages', tags: ['veg', 'vegan'] },
          { id: 'dairy',    label: 'Dairy Products', tags: ['veg', 'dairy'] },
        ],
        dietary_tags: ['veg', 'vegan', 'non-veg', 'gluten-free', 'dairy', 'dairy-free', 'halal', 'jain'],
      };
    }

    return res.status(200).json(taxonomy);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  upload,         // multer middleware — imported in routes
  snapToPost,
  getTaxonomy,
};
