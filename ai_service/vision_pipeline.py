"""
vision_pipeline.py — Hugging Face ViT Food Classifier

Runs Snap-to-Post inference:
  1. Accepts an image URL (Cloudinary CDN) or raw bytes.
  2. Downloads / decodes image → PIL Image.
  3. Runs ViT model inference → Top-3 predictions with confidence scores.
  4. Maps raw labels → Indian food taxonomy (taxonomy_mapping.py).
  5. Returns structured classification result with dietary tags & suggested prices.

Model priority:
  Primary:  rajistics/finetuned-indian-food  (Indian food fine-tune)
  Fallback: nateraw/food-101                 (English food-101 generalist)

Confidence guard (from spec):
  If top-1 confidence < 0.50 → requires_manual_confirmation = True
  (vendor must manually confirm the dish name before posting)
"""

from __future__ import annotations

import io
import time
from typing import Optional

import httpx
from PIL import Image, UnidentifiedImageError

from taxonomy_mapping import resolve_label, FoodEntry

# ─── Model Registry ───────────────────────────────────────────────────────────

MODEL_CONFIGS = [
    {
        "name": "rajistics/finetuned-indian-food",
        "description": "Fine-tuned Indian food classifier",
    },
    {
        "name": "nateraw/food-101",
        "description": "Food-101 generalist fallback",
    },
]

CONFIDENCE_THRESHOLD = 0.50  # below this → manual confirmation required
TOP_K = 3

# ─── Lazy Model Loading ───────────────────────────────────────────────────────

_pipeline = None
_model_name_loaded: Optional[str] = None


def load_model() -> tuple:
    """
    Load the image classification pipeline on first call.
    Tries primary model then falls back. Called during FastAPI lifespan startup.
    Returns (pipeline, model_name) or (None, None) on failure.
    """
    global _pipeline, _model_name_loaded

    if _pipeline is not None:
        return _pipeline, _model_name_loaded

    # Import here so the module is importable even without torch installed
    try:
        from transformers import pipeline as hf_pipeline
    except ImportError:
        print("[Vision] ⚠️  transformers not installed — vision pipeline disabled")
        return None, None

    for config in MODEL_CONFIGS:
        model_name = config["name"]
        try:
            print(f"[Vision] Loading model: {model_name} ...")
            t0 = time.time()
            _pipeline = hf_pipeline(
                "image-classification",
                model=model_name,
                top_k=TOP_K,
            )
            elapsed = time.time() - t0
            _model_name_loaded = model_name
            print(f"[Vision] ✅ Model loaded in {elapsed:.1f}s: {model_name}")
            return _pipeline, _model_name_loaded
        except Exception as e:
            print(f"[Vision] ⚠️  Failed to load {model_name}: {e}")

    print("[Vision] ❌ All models failed to load. Running without vision.")
    return None, None


# ─── Image Fetching ───────────────────────────────────────────────────────────

async def _fetch_image_from_url(url: str) -> Image.Image:
    """Download image bytes from a URL and return a PIL Image."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")


def _load_image_from_bytes(data: bytes) -> Image.Image:
    """Convert raw bytes to a PIL Image."""
    return Image.open(io.BytesIO(data)).convert("RGB")


# ─── Core Inference ───────────────────────────────────────────────────────────

def _run_inference(image: Image.Image) -> list[dict]:
    """
    Run image classification. Returns raw HF predictions:
    [{'label': str, 'score': float}, ...]
    """
    pipe, _ = load_model()
    if pipe is None:
        raise RuntimeError("Vision model not available")

    # Resize for consistent inference speed
    image = image.resize((224, 224))
    results = pipe(image)
    return results  # already top_k sorted by score


# ─── Classification Pipeline ──────────────────────────────────────────────────

async def classify_from_url(image_url: str) -> dict:
    """
    Full pipeline: URL → PIL → ViT → taxonomy resolution → structured output.
    """
    image = await _fetch_image_from_url(image_url)
    return _classify(image)


def classify_from_bytes(data: bytes) -> dict:
    """
    Full pipeline: bytes → PIL → ViT → taxonomy resolution → structured output.
    """
    image = _load_image_from_bytes(data)
    return _classify(image)


def _classify(image: Image.Image) -> dict:
    """Shared classification logic."""
    pipe, model_name = load_model()

    # If model unavailable, return empty result for circuit breaker to catch
    if pipe is None:
        return {
            "model_available": False,
            "predictions": [],
            "food_label": "Unknown",
            "food_category": "other",
            "dietary_tags": [],
            "confidence": 0.0,
            "suggested_prices": None,
            "requires_manual_confirmation": True,
        }

    try:
        raw_results = _run_inference(image)
    except Exception as e:
        raise RuntimeError(f"Inference error: {e}") from e

    # Map each prediction to taxonomy
    predictions = []
    for r in raw_results:
        matched_key, entry = resolve_label(r["label"])
        predictions.append({
            "raw_label": r["label"],
            "matched_key": matched_key,
            "food_label": entry.label,
            "food_category": entry.category,
            "dietary_tags": entry.dietary_tags,
            "confidence": round(r["score"], 4),
        })

    # Top-1 result drives the response
    top = predictions[0] if predictions else None
    top_confidence = top["confidence"] if top else 0.0
    top_entry_key = top["matched_key"] if top else "other"

    from taxonomy_mapping import TAXONOMY
    top_entry: FoodEntry = TAXONOMY.get(top_entry_key) or predictions[0] and _make_dummy_entry(top)  # type: ignore

    requires_confirmation = top_confidence < CONFIDENCE_THRESHOLD

    return {
        "model_available": True,
        "model_name": model_name,
        "predictions": predictions,
        "food_label": top["food_label"] if top else "Unknown",
        "food_category": top["food_category"] if top else "other",
        "dietary_tags": top["dietary_tags"] if top else [],
        "confidence": top_confidence,
        "requires_manual_confirmation": requires_confirmation,
        # suggested_prices filled in main.py using pricing_model
        "suggested_prices": None,
        # top_entry exported for pricing model consumption
        "_top_entry": top_entry,
    }


def _make_dummy_entry(pred: dict) -> FoodEntry:
    from taxonomy_mapping import FoodEntry
    return FoodEntry(
        label=pred["food_label"],
        category=pred.get("food_category", "other"),
        dietary_tags=pred.get("dietary_tags", ["veg"]),
        base_price_inr=80.0,
    )
