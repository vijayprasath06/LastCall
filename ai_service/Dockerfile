# ─── EGPP AI Microservice — Dockerfile ───────────────────────────────────────
#
# Multi-stage build:
#   Stage 1 (builder): installs Python dependencies
#   Stage 2 (runtime): slim image with only necessary artifacts
#
# HuggingFace model weights are downloaded at runtime (first startup).
# To bake them into the image, uncomment the RUN python -c "..." block below.
#
# Build:  docker build -t egpp-ai:latest .
# Run:    docker run -p 8000:8000 --env-file .env egpp-ai:latest

# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# System dependencies for Pillow and PyTorch
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for layer caching
COPY requirements.txt .

# Install into a prefix directory (easier to copy to next stage)
RUN pip install --no-cache-dir --prefix=/install \
    -r requirements.txt

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Minimal runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY . .

# ── Optional: Pre-download HuggingFace model weights at build time ──────────
# Uncomment to bake weights into image (~1.5 GB extra). Leave commented for
# smaller images with first-boot download from HF Hub.
#
# RUN python -c "from transformers import pipeline; \
#     pipeline('image-classification', model='rajistics/finetuned-indian-food', top_k=3)"

# ── Generate pricing PKL if not already present ──────────────────────────────
RUN python pricing_model.py --train || echo "PKL already exists or training skipped"

# ─── Runtime Configuration ────────────────────────────────────────────────────

# HuggingFace cache — mount as volume in production for persistence
ENV HF_HOME=/app/.cache/huggingface
ENV TRANSFORMERS_CACHE=/app/.cache/huggingface/hub

# Workers: 1 to avoid loading model multiple times in memory
ENV UVICORN_WORKERS=1

EXPOSE 8000

# Healthcheck for docker-compose / Kubernetes
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Run with single worker to keep one model instance in RAM
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--log-level", "info", \
     "--timeout-keep-alive", "30"]
