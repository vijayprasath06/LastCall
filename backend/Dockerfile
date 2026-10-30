# ─── EGPP Backend — Dockerfile ────────────────────────────────────────────────
#
# Node.js 22 LTS Alpine — minimal production image
#
# Build:  docker build -t egpp-backend:latest .
# Run:    docker run -p 3001:3001 --env-file .env egpp-backend:latest

FROM node:22-alpine AS runtime

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy application source
COPY . .

EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "src/server.js"]
