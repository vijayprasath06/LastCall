/**
 * Geocoding Service — Free OpenStreetMap Nominatim [ARCH-8]
 *
 * Replaces paid Mapbox geocoding with Nominatim (free, no API key).
 * Used exclusively during vendor onboarding to resolve a typed address
 * into verified GPS coordinates for the immutable verified_location.
 *
 * Rate limit: 1 req/sec per Nominatim usage policy.
 * Required header: User-Agent (identifying application).
 *
 * For production scale: deploy self-hosted Nominatim via Docker
 * to eliminate the 1 req/sec rate limit risk.
 */

const https = require('https');

const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'egpp-food-rescue/1.0 (admin@egpp.app)';

// Simple 1 req/sec throttle (Nominatim usage policy)
let lastRequestTime = 0;

function enforceRateLimit() {
  return new Promise((resolve) => {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    const wait = Math.max(0, 1000 - elapsed);
    lastRequestTime = now + wait;
    setTimeout(resolve, wait);
  });
}

/**
 * Geocode a free-text address string using Nominatim.
 *
 * @param {string} address - Full address string (e.g. "45 Usman Road, T. Nagar, Chennai")
 * @returns {Promise<{ lat: number, lng: number, displayName: string }[]>}
 */
async function geocodeAddress(address) {
  await enforceRateLimit();

  const params = new URLSearchParams({
    q: address,
    format: 'json',
    limit: '5',
    countrycodes: 'in',  // Restrict to India for this application
    addressdetails: '1',
  });

  const url = `${NOMINATIM_BASE_URL}/search?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en',
      },
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          const mapped = results.map((r) => ({
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
            displayName: r.display_name,
            importance: r.importance,
          }));
          resolve(mapped);
        } catch (err) {
          reject(new Error('Failed to parse Nominatim response'));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`Nominatim request failed: ${err.message}`));
    });
  });
}

/**
 * Express handler — GET /api/vendor/geocode?address=...
 * Used by VendorOnboard.jsx to search & confirm store address pin on Leaflet map.
 */
async function geocodeHandler(req, res, next) {
  try {
    const { address } = req.query;
    if (!address || address.trim().length < 5) {
      return res.status(400).json({ error: 'Provide a valid address query (min 5 chars)' });
    }

    const results = await geocodeAddress(address.trim());

    if (results.length === 0) {
      return res.status(404).json({ error: 'No results found for this address' });
    }

    return res.status(200).json({ results });
  } catch (err) {
    next(err);
  }
}

module.exports = { geocodeAddress, geocodeHandler };
