"""
main.py — EGPP AI Microservice (FastAPI)

Endpoints:
  POST /predict     — Snap-to-Post: classify food image + suggest Dutch Auction pricing
  GET  /taxonomy    — Return full food taxonomy JSON for vendor form dropdowns
  GET  /health      — Liveness probe

Startup model pre-warming [Phase 7.1]:
  Uses FastAPI lifespan context to load the ViT model into GPU/CPU memory
  before the first request arrives. This eliminates cold-start latency for
  the first vendor that uses Snap-to-Post.

Circuit Breaker boundary:
  Node.js backend calls this service with a 2000ms timeout.
  All endpoints must respond within that budget.
  Heavy work (model load) is done at startup; inference target is < 800ms.

Environment variables:
  AI_VENDOR_SECRET   — optional shared secret for request validation
  MODEL_CACHE_DIR    — optional HF cache directory (default: ~/.cache/huggingface)
"""

from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

from vision_pipeline import load_model, classify_from_url, classify_from_bytes
from pricing_model import suggest_pricing, _load_model as load_pricing_model
from taxonomy_mapping import get_taxonomy_json, resolve_label


# ─── Lifespan: Pre-Warming ────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs on startup: pre-warm ViT model + pricing model into memory.
    FastAPI will not accept requests until this completes successfully.
    """
    print("[Startup] 🔥 Pre-warming AI models...")
    t0 = time.time()

    # Load vision model
    pipe, model_name = load_model()
    if pipe:
        print(f"[Startup] ✅ Vision model ready: {model_name}")
    else:
        print("[Startup] ⚠️  Vision model NOT loaded — /predict will return fallback responses")

    # Load pricing model (PKL)
    pricing_model = load_pricing_model()
    if pricing_model:
        print("[Startup] ✅ Pricing model ready")
    else:
        print("[Startup] ℹ️  Pricing model not found — using rule-based fallback")

    elapsed = time.time() - t0
    print(f"[Startup] 🚀 AI service ready in {elapsed:.1f}s")

    yield  # Application runs

    # Shutdown
    print("[Shutdown] AI service shutting down")


# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="EGPP AI Microservice",
    description="Snap-to-Post food classification and Dutch Auction price suggestion",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Node.js backend is the only caller
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ─── Request / Response Schemas ───────────────────────────────────────────────

class PredictUrlRequest(BaseModel):
    image_url: str
    minutes_until_close: float = 60.0
    city_density_tier: str = "tier2"
    weather_bad: bool = False
    avg_claim_lag_secs: float = 300.0


class PredictionResponse(BaseModel):
    food_label: str
    food_category: str
    dietary_tags: list[str]
    confidence: float
    requires_manual_confirmation: bool
    predictions: list[dict]
    suggested_prices: dict
    model_available: bool
    model_name: Optional[str] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Liveness probe — always returns 200 if the service is running."""
    _, model_name = load_model()
    return {
        "status": "ok",
        "vision_model": model_name or "not_loaded",
        "pricing_model": "ml" if load_pricing_model() else "rule_based",
    }


@app.post("/predict", response_model=PredictionResponse)
async def predict_from_url(body: PredictUrlRequest):
    """
    Classify food from a Cloudinary image URL.
    Called by Node.js aiController with a 2-second timeout.

    Returns classification + Dutch Auction pricing suggestion.
    """
    try:
        result = await classify_from_url(str(body.image_url))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Classification error: {e}")

    # Resolve top entry for pricing
    top_entry = result.get("_top_entry")
    if top_entry is None:
        _, top_entry = resolve_label(result.get("food_label", "other"))

    # Suggest Dutch Auction pricing
    try:
        pricing = suggest_pricing(
            entry=top_entry,
            minutes_until_close=body.minutes_until_close,
            city_density_tier=body.city_density_tier,
            weather_bad=body.weather_bad,
            avg_claim_lag_secs=body.avg_claim_lag_secs,
        )
    except Exception as e:
        print(f"[Pricing] Error: {e}")
        pricing = {
            "start_price": top_entry.base_price_inr * 0.70,
            "min_rescue_price": top_entry.base_price_inr * 0.30,
            "drop_interval_minutes": top_entry.drop_interval_minutes,
            "drops_count": 4,
            "method": "emergency_fallback",
        }

    return {
        "food_label": result["food_label"],
        "food_category": result["food_category"],
        "dietary_tags": result["dietary_tags"],
        "confidence": result["confidence"],
        "requires_manual_confirmation": result["requires_manual_confirmation"],
        "predictions": result["predictions"],
        "suggested_prices": pricing,
        "model_available": result["model_available"],
        "model_name": result.get("model_name"),
    }


@app.post("/predict/upload")
async def predict_from_upload(
    image: UploadFile = File(...),
    minutes_until_close: float = Form(default=60.0),
    city_density_tier: str = Form(default="tier2"),
    weather_bad: bool = Form(default=False),
    avg_claim_lag_secs: float = Form(default=300.0),
):
    """
    Classify food from a direct image file upload (multipart/form-data).
    Alternative to URL-based endpoint for testing / direct integrations.
    """
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    data = await image.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 10 MB)")

    try:
        result = classify_from_bytes(data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Classification error: {e}")

    top_entry = result.get("_top_entry")
    if top_entry is None:
        _, top_entry = resolve_label(result.get("food_label", "other"))

    pricing = suggest_pricing(
        entry=top_entry,
        minutes_until_close=minutes_until_close,
        city_density_tier=city_density_tier,
        weather_bad=weather_bad,
        avg_claim_lag_secs=avg_claim_lag_secs,
    )

    return {**result, "suggested_prices": pricing, "_top_entry": None}


@app.get("/taxonomy")
async def get_taxonomy():
    """
    Returns the full food taxonomy for the vendor PostDeal form.
    Categories, items, dietary tags — all serialisable JSON.
    """
    return get_taxonomy_json()


# ─── Dev entry point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
