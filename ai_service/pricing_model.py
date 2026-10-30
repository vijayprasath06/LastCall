"""
pricing_model.py — Dutch Auction Dynamic Price Suggester

Provides two modes:
  1. Trained mode: Scikit-learn Random Forest regression model (PKL file).
     Trained on synthetic feature vectors; load from models/price_predictor.pkl.
  2. Rule-based fallback: Deterministic formula using taxonomy base prices,
     time pressure, city density, and weather.

Output for each deal:
  {
    "start_price":            float  — recommended launch price (INR)
    "min_rescue_price":       float  — floor price (min 30% of start)
    "drop_interval_minutes":  int    — minutes between price drops
    "drops_count":            int    — total number of drops until floor
  }

Features fed into the ML model:
  - base_price_inr      (taxonomy baseline)
  - minutes_until_close
  - category_encoded    (ordinal 0..8)
  - density_tier        (0=metro, 1=tier2, 2=suburban)
  - weather_bad         (0 or 1)
  - avg_claim_lag_secs  (vendor history; 0 if unknown)
"""

from __future__ import annotations

import math
import os
import pickle
from pathlib import Path
from typing import Optional

import numpy as np

from taxonomy_mapping import FoodEntry, CATEGORIES

# ─── Constants ────────────────────────────────────────────────────────────────

CATEGORY_ORDER = list(CATEGORIES.keys())  # stable ordinal encoding
MODEL_PATH = Path(__file__).parent / "models" / "price_predictor.pkl"

DENSITY_TIER_MAP = {"metro": 0, "tier2": 1, "suburban": 2, "tier3": 2}

# ─── Model Loading ────────────────────────────────────────────────────────────

_model = None


def _load_model() -> Optional[object]:
    """Lazily load the PKL model once. Returns None if file doesn't exist."""
    global _model
    if _model is not None:
        return _model
    if MODEL_PATH.exists():
        try:
            with open(MODEL_PATH, "rb") as f:
                _model = pickle.load(f)
            print(f"[PricingModel] ✅ Loaded ML model from {MODEL_PATH}")
        except Exception as e:
            print(f"[PricingModel] ⚠️  Failed to load model: {e} — using rule-based fallback")
            _model = None
    else:
        print(f"[PricingModel] ℹ️  No PKL found at {MODEL_PATH} — using rule-based fallback")
    return _model


# ─── Feature Extraction ───────────────────────────────────────────────────────

def _build_feature_vector(
    entry: FoodEntry,
    minutes_until_close: float,
    city_density_tier: str,
    weather_bad: bool,
    avg_claim_lag_secs: float,
) -> np.ndarray:
    cat_encoded = CATEGORY_ORDER.index(entry.category) if entry.category in CATEGORY_ORDER else len(CATEGORY_ORDER)
    density = DENSITY_TIER_MAP.get(city_density_tier.lower(), 1)
    return np.array([[
        entry.base_price_inr,
        minutes_until_close,
        cat_encoded,
        density,
        int(weather_bad),
        avg_claim_lag_secs,
    ]], dtype=np.float32)


# ─── Rule-Based Fallback ──────────────────────────────────────────────────────

def _rule_based_pricing(
    entry: FoodEntry,
    minutes_until_close: float,
    city_density_tier: str,
    weather_bad: bool,
) -> dict:
    """
    Deterministic Dutch Auction price suggestion.

    Formula:
      start_discount = 0.30 if > 45min, 0.45 if 20-45min, 0.60 if < 20min
      start_price    = base_price × (1 - start_discount)
      min_price      = base_price × 0.30   (floor: 30% of base)
      drops          = max(2, min(8, floor(minutes / drop_interval)))
    """
    base = entry.base_price_inr

    # Time-pressure discount
    if minutes_until_close > 45:
        start_discount = 0.30
    elif minutes_until_close > 20:
        start_discount = 0.45
    else:
        start_discount = 0.60

    # Weather nudge — bad weather reduces mobility, drop prices faster
    if weather_bad:
        start_discount = min(start_discount + 0.05, 0.70)

    # City density — lower-density areas need deeper discounts to attract
    density = DENSITY_TIER_MAP.get(city_density_tier.lower(), 1)
    density_bonus = [0.0, 0.05, 0.10][density]
    start_discount = min(start_discount + density_bonus, 0.75)

    start_price = round(base * (1 - start_discount), 0)
    min_price = round(max(base * 0.30, 10.0), 0)  # floor at ₹10

    # Clamp start above min
    start_price = max(start_price, min_price + 10)

    interval = entry.drop_interval_minutes
    drops = max(2, min(8, math.floor(minutes_until_close / interval)))

    return {
        "start_price": float(start_price),
        "min_rescue_price": float(min_price),
        "drop_interval_minutes": interval,
        "drops_count": drops,
        "method": "rule_based",
    }


# ─── Main Prediction API ──────────────────────────────────────────────────────

def suggest_pricing(
    entry: FoodEntry,
    minutes_until_close: float,
    city_density_tier: str = "tier2",
    weather_bad: bool = False,
    avg_claim_lag_secs: float = 300.0,
) -> dict:
    """
    Suggest Dutch Auction pricing for a food item.

    Tries ML model first (if loaded); falls back to rule-based if:
      - Model not found
      - Model raises any exception
      - minutes_until_close < 5 (too late for ML to matter)

    Returns dict with start_price, min_rescue_price, drop_interval_minutes,
    drops_count, and method ('ml' or 'rule_based').
    """
    # Short-circuit for very late deals — always use rule-based
    if minutes_until_close < 5:
        return _rule_based_pricing(entry, minutes_until_close, city_density_tier, weather_bad)

    model = _load_model()

    if model is not None:
        try:
            features = _build_feature_vector(
                entry, minutes_until_close, city_density_tier,
                weather_bad, avg_claim_lag_secs,
            )
            # Model predicts [start_price, min_rescue_price]
            prediction = model.predict(features)[0]
            start_price = round(float(prediction[0]), 0)
            min_price = round(float(prediction[1]), 0)

            # Safety clamps
            min_price = max(min_price, entry.base_price_inr * 0.25, 10.0)
            start_price = max(start_price, min_price + 10)

            interval = entry.drop_interval_minutes
            drops = max(2, min(8, math.floor(minutes_until_close / interval)))

            return {
                "start_price": start_price,
                "min_rescue_price": min_price,
                "drop_interval_minutes": interval,
                "drops_count": drops,
                "method": "ml",
            }
        except Exception as e:
            print(f"[PricingModel] ⚠️  ML prediction failed: {e} — falling back to rules")

    return _rule_based_pricing(entry, minutes_until_close, city_density_tier, weather_bad)


# ─── Model Training Script (run once to generate PKL) ────────────────────────

def train_and_save(output_path: Path = MODEL_PATH) -> None:
    """
    Trains a Random Forest regressor on synthetic data and saves to PKL.
    Run this once: `python pricing_model.py --train`

    Training data is procedurally generated from the rule-based formula
    with Gaussian noise to simulate real-world variance.
    """
    from sklearn.ensemble import RandomForestRegressor

    rng = np.random.default_rng(42)
    n = 10_000

    # Synthetic features
    base_prices    = rng.uniform(10, 300, n)
    minutes        = rng.uniform(5, 120, n)
    categories     = rng.integers(0, len(CATEGORY_ORDER), n)
    densities      = rng.integers(0, 3, n)
    weather_bad    = rng.integers(0, 2, n)
    lag_secs       = rng.uniform(0, 1200, n)

    X = np.column_stack([base_prices, minutes, categories, densities, weather_bad, lag_secs])

    # Labels derived from rule-based formula + noise
    def _base_discount(mins, density, bad_weather):
        d = 0.30 if mins > 45 else (0.45 if mins > 20 else 0.60)
        d += bad_weather * 0.05 + [0, 0.05, 0.10][density]
        return min(d, 0.75)

    discounts = np.array([_base_discount(m, d, w) for m, d, w in zip(minutes, densities, weather_bad)])
    starts    = np.round(base_prices * (1 - discounts) + rng.normal(0, 5, n), 0)
    mins_p    = np.round(np.maximum(base_prices * 0.30, 10) + rng.normal(0, 2, n), 0)
    starts    = np.maximum(starts, mins_p + 10)

    y = np.column_stack([starts, mins_p])

    model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    model.fit(X, y)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        pickle.dump(model, f)
    print(f"[PricingModel] ✅ Model trained and saved to {output_path}")


if __name__ == "__main__":
    import sys
    if "--train" in sys.argv:
        train_and_save()
    else:
        print("Usage: python pricing_model.py --train")
