"""
taxonomy_mapping.py — Indian Food Taxonomy & Dietary Tag Mapper

Created first because both vision_pipeline.py and pricing_model.py depend on it.

Covers:
  - Standardized food label → category mapping
  - Dietary tag classification (veg, vegan, non-veg, dairy, gluten, halal, jain)
  - Baseline INR price table for Dutch Auction seed prices
  - Closest-match fuzzy resolver (for low-confidence ViT predictions)
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
import re

# ─── Data Structures ────────────────────────────────────────────────────────────

@dataclass
class FoodEntry:
    label: str                        # Canonical display name
    category: str                     # Broad category key
    dietary_tags: list[str]           # e.g. ['veg', 'dairy']
    base_price_inr: float             # Typical retail price (INR)
    drop_interval_minutes: int = 10   # Suggested Dutch Auction drop interval
    description: str = ""

# ─── Master Taxonomy ─────────────────────────────────────────────────────────────

TAXONOMY: dict[str, FoodEntry] = {
    # ── Breakfast / South Indian ─────────────────────────────────────────────
    "idli": FoodEntry(
        label="Idli", category="south_indian",
        dietary_tags=["veg", "vegan", "gluten-free"],
        base_price_inr=40, drop_interval_minutes=8,
        description="Steamed rice cakes",
    ),
    "dosa": FoodEntry(
        label="Dosa", category="south_indian",
        dietary_tags=["veg", "vegan", "gluten-free"],
        base_price_inr=60, drop_interval_minutes=8,
    ),
    "masala_dosa": FoodEntry(
        label="Masala Dosa", category="south_indian",
        dietary_tags=["veg", "gluten-free"],
        base_price_inr=80, drop_interval_minutes=8,
    ),
    "vada": FoodEntry(
        label="Medu Vada", category="south_indian",
        dietary_tags=["veg", "gluten-free"],
        base_price_inr=40, drop_interval_minutes=8,
    ),
    "uttapam": FoodEntry(
        label="Uttapam", category="south_indian",
        dietary_tags=["veg", "gluten-free"],
        base_price_inr=60, drop_interval_minutes=8,
    ),
    "pongal": FoodEntry(
        label="Pongal", category="south_indian",
        dietary_tags=["veg", "gluten-free"],
        base_price_inr=50, drop_interval_minutes=8,
    ),
    "upma": FoodEntry(
        label="Upma", category="south_indian",
        dietary_tags=["veg"],
        base_price_inr=40, drop_interval_minutes=8,
    ),

    # ── Rice / Biryani ───────────────────────────────────────────────────────
    "biryani": FoodEntry(
        label="Biryani", category="rice",
        dietary_tags=["non-veg", "gluten-free"],
        base_price_inr=180, drop_interval_minutes=12,
    ),
    "veg_biryani": FoodEntry(
        label="Veg Biryani", category="rice",
        dietary_tags=["veg", "gluten-free"],
        base_price_inr=140, drop_interval_minutes=12,
    ),
    "fried_rice": FoodEntry(
        label="Fried Rice", category="rice",
        dietary_tags=["veg", "gluten-free"],
        base_price_inr=120, drop_interval_minutes=10,
    ),
    "pulao": FoodEntry(
        label="Pulao", category="rice",
        dietary_tags=["veg", "gluten-free"],
        base_price_inr=100, drop_interval_minutes=10,
    ),
    "curd_rice": FoodEntry(
        label="Curd Rice", category="rice",
        dietary_tags=["veg", "gluten-free", "dairy"],
        base_price_inr=60, drop_interval_minutes=8,
    ),

    # ── Curries / Gravies ────────────────────────────────────────────────────
    "paneer_butter_masala": FoodEntry(
        label="Paneer Butter Masala", category="curry",
        dietary_tags=["veg", "dairy", "gluten-free"],
        base_price_inr=160, drop_interval_minutes=12,
    ),
    "dal_makhani": FoodEntry(
        label="Dal Makhani", category="curry",
        dietary_tags=["veg", "dairy", "gluten-free"],
        base_price_inr=120, drop_interval_minutes=12,
    ),
    "chicken_curry": FoodEntry(
        label="Chicken Curry", category="curry",
        dietary_tags=["non-veg", "gluten-free", "halal"],
        base_price_inr=200, drop_interval_minutes=12,
    ),
    "fish_curry": FoodEntry(
        label="Fish Curry", category="curry",
        dietary_tags=["non-veg", "gluten-free"],
        base_price_inr=220, drop_interval_minutes=12,
    ),
    "sambar": FoodEntry(
        label="Sambar", category="curry",
        dietary_tags=["veg", "vegan", "gluten-free"],
        base_price_inr=40, drop_interval_minutes=8,
    ),

    # ── Bread / Roti ─────────────────────────────────────────────────────────
    "chapati": FoodEntry(
        label="Chapati / Roti", category="bread",
        dietary_tags=["veg", "vegan"],
        base_price_inr=8, drop_interval_minutes=6,
    ),
    "paratha": FoodEntry(
        label="Paratha", category="bread",
        dietary_tags=["veg"],
        base_price_inr=40, drop_interval_minutes=8,
    ),
    "naan": FoodEntry(
        label="Naan", category="bread",
        dietary_tags=["veg", "dairy"],
        base_price_inr=30, drop_interval_minutes=8,
    ),
    "puri": FoodEntry(
        label="Puri", category="bread",
        dietary_tags=["veg", "vegan"],
        base_price_inr=20, drop_interval_minutes=8,
    ),

    # ── Snacks / Street Food ──────────────────────────────────────────────────
    "samosa": FoodEntry(
        label="Samosa", category="snack",
        dietary_tags=["veg", "vegan"],
        base_price_inr=15, drop_interval_minutes=6,
    ),
    "pakora": FoodEntry(
        label="Pakora / Bhajia", category="snack",
        dietary_tags=["veg", "vegan"],
        base_price_inr=30, drop_interval_minutes=6,
    ),
    "vada_pav": FoodEntry(
        label="Vada Pav", category="snack",
        dietary_tags=["veg", "vegan"],
        base_price_inr=25, drop_interval_minutes=6,
    ),
    "pav_bhaji": FoodEntry(
        label="Pav Bhaji", category="snack",
        dietary_tags=["veg"],
        base_price_inr=80, drop_interval_minutes=8,
    ),
    "chaat": FoodEntry(
        label="Chaat", category="snack",
        dietary_tags=["veg"],
        base_price_inr=60, drop_interval_minutes=8,
    ),

    # ── Bakery ───────────────────────────────────────────────────────────────
    "bread_loaf": FoodEntry(
        label="Bread Loaf", category="bakery",
        dietary_tags=["veg", "vegan"],
        base_price_inr=45, drop_interval_minutes=10,
    ),
    "croissant": FoodEntry(
        label="Croissant", category="bakery",
        dietary_tags=["veg", "dairy"],
        base_price_inr=60, drop_interval_minutes=10,
    ),
    "muffin": FoodEntry(
        label="Muffin", category="bakery",
        dietary_tags=["veg", "dairy"],
        base_price_inr=40, drop_interval_minutes=10,
    ),
    "cake": FoodEntry(
        label="Cake / Pastry", category="bakery",
        dietary_tags=["veg", "dairy"],
        base_price_inr=120, drop_interval_minutes=10,
    ),
    "cookie": FoodEntry(
        label="Cookies / Biscuits", category="bakery",
        dietary_tags=["veg"],
        base_price_inr=80, drop_interval_minutes=12,
    ),
    "sandwich": FoodEntry(
        label="Sandwich", category="bakery",
        dietary_tags=["veg"],
        base_price_inr=70, drop_interval_minutes=8,
    ),
    "pizza": FoodEntry(
        label="Pizza", category="bakery",
        dietary_tags=["veg", "dairy"],
        base_price_inr=200, drop_interval_minutes=10,
    ),
    "burger": FoodEntry(
        label="Burger", category="bakery",
        dietary_tags=["veg"],
        base_price_inr=120, drop_interval_minutes=8,
    ),

    # ── Desserts / Sweets ─────────────────────────────────────────────────────
    "gulab_jamun": FoodEntry(
        label="Gulab Jamun", category="dessert",
        dietary_tags=["veg", "dairy"],
        base_price_inr=60, drop_interval_minutes=10,
    ),
    "halwa": FoodEntry(
        label="Halwa", category="dessert",
        dietary_tags=["veg", "dairy"],
        base_price_inr=80, drop_interval_minutes=10,
    ),
    "kheer": FoodEntry(
        label="Kheer / Payasam", category="dessert",
        dietary_tags=["veg", "dairy", "gluten-free"],
        base_price_inr=80, drop_interval_minutes=10,
    ),
    "ice_cream": FoodEntry(
        label="Ice Cream", category="dessert",
        dietary_tags=["veg", "dairy", "gluten-free"],
        base_price_inr=60, drop_interval_minutes=8,
    ),
    "ladoo": FoodEntry(
        label="Ladoo / Mithai", category="dessert",
        dietary_tags=["veg", "dairy", "jain"],
        base_price_inr=100, drop_interval_minutes=12,
    ),
    "barfi": FoodEntry(
        label="Barfi / Burfi", category="dessert",
        dietary_tags=["veg", "dairy", "gluten-free"],
        base_price_inr=120, drop_interval_minutes=12,
    ),

    # ── Beverages ─────────────────────────────────────────────────────────────
    "chai": FoodEntry(
        label="Chai / Tea", category="beverage",
        dietary_tags=["veg", "dairy", "gluten-free"],
        base_price_inr=15, drop_interval_minutes=5,
    ),
    "coffee": FoodEntry(
        label="Coffee", category="beverage",
        dietary_tags=["veg", "dairy", "gluten-free"],
        base_price_inr=40, drop_interval_minutes=5,
    ),
    "lassi": FoodEntry(
        label="Lassi", category="beverage",
        dietary_tags=["veg", "dairy", "gluten-free"],
        base_price_inr=60, drop_interval_minutes=6,
    ),
    "juice": FoodEntry(
        label="Fruit Juice", category="beverage",
        dietary_tags=["vegan", "gluten-free"],
        base_price_inr=50, drop_interval_minutes=6,
    ),

    # ── Full Meals ────────────────────────────────────────────────────────────
    "thali": FoodEntry(
        label="Thali / Meal Combo", category="meal",
        dietary_tags=["veg", "dairy", "gluten-free"],
        base_price_inr=150, drop_interval_minutes=12,
    ),
    "lunch_box": FoodEntry(
        label="Lunch Box / Tiffin", category="meal",
        dietary_tags=["veg"],
        base_price_inr=120, drop_interval_minutes=12,
    ),
}

# ─── Category Metadata ────────────────────────────────────────────────────────

CATEGORIES = {
    "south_indian": {"label": "South Indian", "emoji": "🥣"},
    "rice":         {"label": "Rice / Biryani", "emoji": "🍚"},
    "curry":        {"label": "Curries / Gravies", "emoji": "🍛"},
    "bread":        {"label": "Bread / Roti", "emoji": "🫓"},
    "snack":        {"label": "Snacks / Street Food", "emoji": "🥙"},
    "bakery":       {"label": "Bakery & Baked Goods", "emoji": "🥐"},
    "dessert":      {"label": "Desserts / Sweets", "emoji": "🍮"},
    "beverage":     {"label": "Beverages", "emoji": "🥤"},
    "meal":         {"label": "Full Meals / Combos", "emoji": "🍱"},
    "other":        {"label": "Other Food Items", "emoji": "🍽️"},
}

ALL_DIETARY_TAGS = [
    "veg", "vegan", "non-veg",
    "gluten-free", "dairy", "dairy-free",
    "halal", "jain",
]

# ─── Lookup Functions ─────────────────────────────────────────────────────────

def get_food_entry(label: str) -> Optional[FoodEntry]:
    """Exact key lookup (normalised)."""
    key = _normalise(label)
    return TAXONOMY.get(key)


def resolve_label(raw_label: str) -> tuple[str, FoodEntry]:
    """
    Maps a raw ViT model label to the closest TAXONOMY entry.
    Returns (matched_key, FoodEntry).
    Falls back to a 'generic' entry if nothing matches.
    """
    norm = _normalise(raw_label)

    # 1. Exact match
    if norm in TAXONOMY:
        return norm, TAXONOMY[norm]

    # 2. Substring match (label contains a taxonomy key)
    for key, entry in TAXONOMY.items():
        if key in norm or norm in key:
            return key, entry

    # 3. Word-level partial match
    words = norm.split("_")
    for key, entry in TAXONOMY.items():
        for word in words:
            if len(word) >= 4 and word in key:
                return key, entry

    # 4. Fallback — return a generic "other" entry
    fallback = FoodEntry(
        label=raw_label.replace("_", " ").title(),
        category="other",
        dietary_tags=["veg"],
        base_price_inr=80,
        drop_interval_minutes=10,
    )
    return "other", fallback


def _normalise(label: str) -> str:
    """Lowercase, strip spaces/hyphens → underscores."""
    return re.sub(r"[\s\-]+", "_", label.lower().strip())


def get_taxonomy_json() -> dict:
    """Returns the full taxonomy as a JSON-serialisable dict for the /taxonomy endpoint."""
    return {
        "categories": [
            {
                "id": cat_id,
                "label": meta["label"],
                "emoji": meta["emoji"],
                "items": [
                    {
                        "key": k,
                        "label": e.label,
                        "dietary_tags": e.dietary_tags,
                        "base_price_inr": e.base_price_inr,
                    }
                    for k, e in TAXONOMY.items()
                    if e.category == cat_id
                ],
            }
            for cat_id, meta in CATEGORIES.items()
        ],
        "dietary_tags": ALL_DIETARY_TAGS,
    }
