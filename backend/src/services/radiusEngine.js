/**
 * Dynamic Radius Engine [Section 9 — RadiusEngine]
 *
 * Computes the effective push radius (meters) for a new deal posting.
 * Called once at deal creation; result stored as deals.effective_radius_meters.
 *
 * Algorithm (4 multiplicative factors):
 *   BASE = 2000m
 *   × density_multiplier  (metro: 0.6 | tier2: 1.0 | tier3/suburban: 1.8)
 *   × urgency_multiplier  (>45min: 0.8 | 20-45min: 1.0 | <20min: 1.4)
 *   × quantity_multiplier (1-2 items: 0.7 | 3-5: 1.0 | 6+: 1.3)
 *   × claim_rate_modifier (>80%: 0.9 | <40%: 1.2 | else: 1.0)
 *
 * Hard limits: clamp(result, 500, 5000)
 */

const BASE_RADIUS = 2000; // meters

/**
 * Compute effective push radius for a deal.
 *
 * @param {object} params
 * @param {'metro'|'tier2'|'tier3'} params.cityDensityTier - vendor's city tier
 * @param {number} params.minutesUntilClose - minutes until deal expires_at
 * @param {number} params.totalQuantity - total items in the deal
 * @param {number} params.avgClaimRate - vendor's historical avg claim rate (0-100)
 * @returns {number} effective radius in meters (integer, clamped 500–5000)
 */
function computeRadius({ cityDensityTier, minutesUntilClose, totalQuantity, avgClaimRate }) {
  // ── Factor 1: City Density Multiplier ──────────────────────────────────────
  const densityMultiplier = {
    metro: 0.6,
    tier2: 1.0,
    tier3: 1.8,
  }[cityDensityTier] ?? 1.0;

  // ── Factor 2: Time Urgency Multiplier ──────────────────────────────────────
  let urgencyMultiplier;
  if (minutesUntilClose > 45) {
    urgencyMultiplier = 0.8;
  } else if (minutesUntilClose >= 20) {
    urgencyMultiplier = 1.0;
  } else {
    urgencyMultiplier = 1.4;
  }

  // ── Factor 3: Quantity Multiplier ──────────────────────────────────────────
  let quantityMultiplier;
  if (totalQuantity <= 2) {
    quantityMultiplier = 0.7;
  } else if (totalQuantity <= 5) {
    quantityMultiplier = 1.0;
  } else {
    quantityMultiplier = 1.3;
  }

  // ── Factor 4: Historical Claim Rate Modifier ───────────────────────────────
  let claimRateModifier;
  if (avgClaimRate > 80) {
    claimRateModifier = 0.9;  // Popular vendor — tighter radius, still finds claimers fast
  } else if (avgClaimRate < 40) {
    claimRateModifier = 1.2;  // Low-claim vendor — cast wider net
  } else {
    claimRateModifier = 1.0;
  }

  // ── Compute & Clamp ────────────────────────────────────────────────────────
  const raw = BASE_RADIUS * densityMultiplier * urgencyMultiplier * quantityMultiplier * claimRateModifier;
  const clamped = Math.max(500, Math.min(5000, raw));

  return Math.round(clamped);
}

module.exports = { computeRadius };
