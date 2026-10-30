/**
 * Real-Time Urgency Score (RUS) Calculator [Section 10, PROD-2]
 *
 * Computes a 0–10 composite score across 5 weighted factors to guide
 * consumer urgency. Recalculated every 5 minutes by Worker 3 and
 * immediately on any claimed_quantity change.
 *
 * Factors:
 *   F1 — Time Pressure       (35%)
 *   F2 — Scarcity            (30%)
 *   F3 — Historical Claim Lag(20%)
 *   F4 — User Distance       (10%)
 *   F5 — Weather Mobility    ( 5%) — multiplier on weighted sum
 *
 * PROD-2 FIX: Weather factor measures USER MOBILITY LIKELIHOOD (not scarcity).
 *   Bad weather = users less mobile = lower RUS.
 *   Applied as a final multiplier, not an additive term.
 *
 * Labels:
 *   RUS >= 8.0 → GOING_NOW   (red, pulsing)
 *   RUS >= 5.0 → ACT_SOON    (orange)
 *   RUS <  5.0 → COMFORTABLE (yellow)
 */

/**
 * @param {object} params
 * @param {number} params.minutesRemaining     - minutes until deal expires
 * @param {number} params.itemsRemaining       - total_quantity - claimed_quantity
 * @param {number} params.avgClaimLagSecs      - vendor's avg seconds to first claim
 * @param {number} [params.distanceKm]         - user's distance in km (personalized; null for global)
 * @param {string} [params.weatherCondition]   - 'bad' | 'good' (from weatherService cache)
 * @returns {{ score: number, label: string }}
 */
function calculateRUS({ minutesRemaining, itemsRemaining, avgClaimLagSecs, distanceKm = 1.0, weatherCondition = 'good' }) {
  // ── F1: Time Pressure (weight 35%) ─────────────────────────────────────────
  // 0 min left → 10.0 | 60+ min left → 0.0
  const f1 = Math.max(0, (60 - minutesRemaining) / 60) * 10;

  // ── F2: Scarcity (weight 30%) ───────────────────────────────────────────────
  // 1 item left → 8.0 | 5+ items → 0.0
  const f2 = Math.max(0, (5 - itemsRemaining) / 5) * 10;

  // ── F3: Historical Claim Speed (weight 20%) ─────────────────────────────────
  // Fast vendor (low lag) → higher score. 120s lag → ~9.0 | 1200s lag → ~0
  const f3 = Math.max(0, 10 - (avgClaimLagSecs / 120));

  // ── F4: User Distance (weight 10%) — personalized ──────────────────────────
  // 0 km → 10.0 | 2+ km → 0.0
  const f4 = Math.max(0, (2 - distanceKm) / 2) * 10;

  // ── F5: Weather Mobility Multiplier (weight 5%) ─────────────────────────────
  // PROD-2 FIX: bad weather = users less mobile = lower urgency to travel
  // Applied as multiplier on the weighted sum (not as additive factor)
  const weatherModifier = weatherCondition === 'bad' ? 0.85 : 1.00;

  // ── Weighted Sum ────────────────────────────────────────────────────────────
  const rawScore = (f1 * 0.35) + (f2 * 0.30) + (f3 * 0.20) + (f4 * 0.10);
  const finalScore = rawScore * weatherModifier;

  // Clamp to 0–10 and round to 2 decimal places
  const score = Math.min(10, Math.max(0, parseFloat(finalScore.toFixed(2))));

  // ── Label Mapping ───────────────────────────────────────────────────────────
  let label;
  if (score >= 8.0) {
    label = 'GOING_NOW';
  } else if (score >= 5.0) {
    label = 'ACT_SOON';
  } else {
    label = 'COMFORTABLE';
  }

  return { score, label };
}

module.exports = { calculateRUS };
