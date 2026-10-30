# Ephemeral Geospatial Push Protocol (EGPP)
## Zero-Waste Food Rescue Platform — Master Implementation Plan

> **Document Status:** Implementation Complete (All 10 Phases Executed & Validated)
> **Source Documents Analyzed:** `docs/PROJECT_BLUEPRINT.md` (v1.2), `docs/Zero_Waste_Presentation.tex`, `docs/journal_papers_references.md`  
> **Author / Lead Researcher:** Vijayprasath G (311523205061), Guided by Mohan Raj Vijayan  
> **Target Delivery:** End-to-End Functional Platform (Backend + AI Microservice + Consumer/Vendor PWAs + Background Workers + PostGIS)

---

## Executive Summary & Architectural Vision

The **Ephemeral Geospatial Push Protocol (EGPP)** is an event-driven, hyper-local marketplace engineering solution addressing urban food waste in the closing operating minutes of retail food vendors. Unlike conventional pull-based food rescue applications (e.g., Too Good To Go, Karma, OLIO) that rely on opaque mystery bags and manual user browsing, EGPP operates on:
1. **Snap-to-Post Vision AI:** Multi-modal image recognition using a fine-tuned Hugging Face Vision Transformer (ViT) to classify items in seconds and auto-populate Dutch Auction pricing.
2. **Active Event-Driven Geospatial Push:** PostGIS GIST-indexed spatial queries matching nearby authenticated consumers within a dynamically calculated radius (500m–5000m).
3. **Dual-Channel Real-Time Delivery with Mutual Exclusion:** Server-Sent Events (SSE) for in-app users and Firebase Cloud Messaging (FCM)/Web Push for background devices, deduplicated via Redis presence keys.
4. **Real-Time Urgency Score (RUS):** A composite 5-factor scoring engine (Time Pressure, Scarcity, Claim Lag, Distance, Weather Mobility) that visually guides consumer action.
5. **ACID Concurrency & Guarded NGO Cascade:** Zero overselling via atomic SQL CTE claims, voluntary cancellation with zero penalties, and automated NGO handoff strictly when zero claims exist at T-15 minutes.
6. **Strict Ephemeral Data Lifecycle & Privacy:** Hard server-enforced TTLs, zero location tracking history, age-gated registration (13+), and full compliance with DPDP Act 2023 and GDPR.

---

## System Architecture & Component Interactions

```
+------------------------------------------------------------------------------------+
|                                FRONTEND LAYER (PWA)                                |
|  Consumer PWA (React + Vite)                      Vendor PWA (React + Vite)        |
|  - Live SSE Deal Feed                             - Snap-to-Post Camera Interface  |
|  - Real-Time Urgency Meter (RUS)                  - Leaflet Geocoding Confirmation |
|  - ACID Claim Modal + Dynamic QR                  - Live Real-time Claim Stream    |
|  - DPDP Consent & "Go Offline" Toggle             - QR Code Scanner for Pickup     |
+--------------------------+----------------------------------+----------------------+
                           |                                  |
               HTTP / SSE  |                      HTTP / SSE  | Multipart Upload
                           v                                  v
+------------------------------------------------------------------------------------+
|                         BACKEND API GATEWAY (Node.js / Express)                    |
|  - JWT Auth + Redis Refresh Blocklist [ARCH-7]      - Zod Validation Schemas       |
|  - Server-Side Age Gate (DOB > 13yo) [COMP-1]       - Rate Limiting [COMP-3]       |
|  - SSE Connection Manager (15s Heartbeat) [CRIT-5]  - Mutation Guard Rules [PROD-4]|
+--------------+-------------------+-------------------+-------------------+---------+
               |                   |                   |                   |
               v                   v                   v                   v
+----------------------+ +------------------+ +------------------+ +-----------------+
|  Geospatial Engine   | |   Claim Engine   | |   Push Service   | | Cloudinary CDN  |
|  - Dynamic Radius    | |  - Atomic SQL CTE| |  - Redis Presence| | - Food Snapshots|
|  - PostGIS ST_DWithin| |    (CRIT-2 ACID) | |  - SSE vs FCM/   | |   Image Hosting |
|    Indexed JOIN      | |  - Auto QR Token | |    WebPush Mutex | +-----------------+
+----------+-----------+ +--------+---------+ +--------+---------+
           |                      |                    |
           v                      v                    v
+------------------------------------------------------------------------------------+
|                               DATA & STORAGE LAYER                                 |
|  PostgreSQL 16 + PostGIS 3.4                  Redis 7 In-Memory Store              |
|  - users (Point 4326 GIST, Age, Consent)      - Refresh Token Whitelist / Blocklist|
|  - vendors (Verified Point 4326 GIST, Tier)   - SSE Active Presence Map (30s TTL)  |
|  - deals (JSONB Items, Dutch Auction, Status) - Weather Cache (City -> Metrics)    |
|  - claims (UUID, QR Token, Auto Expiry)       - BullMQ Job Queues                  |
|  - vendor_analytics (Composite Index, Audit)                                       |
+------------------------------------------------------------------------------------+
                                  ^                    ^
                                  |                    |
+---------------------------------+                    +-----------------------------+
|                                                                                    |
|  BULLMQ BACKGROUND WORKERS (Node.js)          PYTHON FASTAPI AI MICROSERVICE       |
|  Worker 1: Deal Expiry Sweep                  - Model Pre-Warming on Startup       |
|  Worker 2: Claim Timeout & Auto-Release       - Hugging Face ViT Food Classifier   |
|  Worker 3: Urgency Score (RUS) Recalculator     (rajistics/finetuned-indian-food)  |
|  Worker 4: Pickup Push Notification Reminder  - Food Taxonomy & Tag Mapper         |
|  Worker 5: OpenWeatherMap Refresher           - Dynamic Dutch Auction Regressor    |
|  Worker 6: Dutch Auction Price Dropper        - 2000ms Circuit Breaker Fallback    |
|  Worker 7: Guarded NGO Handoff Cascade                                             |
+------------------------------------------------------------------------------------+
```

---

## 10-Phase Detailed Implementation Roadmap

### Phase 1: Environment Orchestration, PostGIS & Database Foundation
**Goal:** Establish reproducible local infrastructure, apply database schema with GIST spatial indices, and build migration/seed toolchains.

- **1.1 Containerization Setup (`docker-compose.yml`):**
  - Service `postgres`: PostgreSQL 16 image with PostGIS 3.4 pre-installed (`postgis/postgis:16-3.4`). Configuration of persistent volume, health checks, and default database `egpp_db`.
  - Service `redis`: Redis 7 Alpine with persistent AOF enabled and password security.
  - Service `nginx`: Reverse proxy with custom config (`proxy_read_timeout 65s; proxy_buffering off; chunked_transfer_encoding on`).
- **1.2 Database Migrations (Knex.js):**
  - Migration 01: Enable PostGIS extension (`CREATE EXTENSION IF NOT EXISTS postgis;`).
  - Migration 02: Table `users` (UUID primary key, `date_of_birth DATE NOT NULL`, `current_location GEOGRAPHY(Point, 4326)`, `location_consent`, `reliability_score DEFAULT 1.00`, `is_flagged`, GIST index on `current_location`).
  - Migration 03: Table `vendors` (`verified_address`, `verified_location GEOGRAPHY(Point, 4326) NOT NULL`, `city_density_tier`, `is_verified`, business hours, analytics accumulators, GIST index on `verified_location`).
  - Migration 04: Table `deals` (`items JSONB`, `original_price`, `start_price`, `current_price`, `min_rescue_price`, `next_price_drop_at`, `status` enum, `expires_at`, `deal_location GEOGRAPHY(Point, 4326)`, `effective_radius_meters`, `urgency_score`, GIST index on `deal_location`).
  - Migration 05: Table `claims` (`deal_id`, `user_id`, `status` enum, `qr_token UNIQUE`, `qr_expires_at TIMESTAMPTZ NOT NULL`, timestamps, unique constraint `(deal_id, user_id)`).
  - Migration 06: Table `vendor_analytics` (composite index `(vendor_id, recorded_at DESC)`, snapshot columns `deal_title_snapshot`, `deal_price_snapshot`, `ON DELETE SET NULL` on `deal_id`).
- **1.3 Mock Data & Seed Generation:**
  - Realistic seed scripts covering 5 registered vendors across Chennai (T. Nagar, Adyar, Velachery, Anna Nagar, Mylapore).
  - Pre-seeded active food deals with exact item structures, Dutch auction parameters, and mock consumers situated at varying radii (300m, 1.2km, 3.5km, 7km) to test geofencing.

---

### Phase 2: Security, Authentication & DPDP/GDPR Compliance Subsystem
**Goal:** Implement zero-trust authentication, token lifecycle management via Redis, explicit dual-role authentication (Consumer vs Vendor), and legal privacy protocols.

- **2.1 Token Lifecycle & Redis Revocation (`authController.js`, `auth.js`):**
  - Dual-token architecture: Access token (15-min TTL, signed with JWT_ACCESS_SECRET) and Refresh token (7-day TTL with unique `jti`).
  - JWT Claims payload: `{ id, role: 'consumer' | 'vendor' | 'admin', vendorId: vendor ? vendor.id : null }`.
  - Redis token storage: `SET refresh:{jti} {userId} EX 604800`.
  - Instant logout & revocation: `DEL refresh:{jti}` and access token blacklist `SET blocklist:{accessJti} 1 EX 900`.
  - SSE connection authorization checking blacklist state prior to stream admission.
- **2.2 Explicit Dual-Role Authentication & Smart Portal Routing (`authController.js`, `roleGuard.js`):**
  - **Consumer Registration Flow (`POST /api/auth/register` with `role: 'consumer'`):**
    - Inputs: `name`, `email` or `phone`, `password`, `date_of_birth` (mandatory age verification), and `data_processing_consent`.
    - Profile initialized with `reliability_score = 1.00`, `total_claims = 0`, `is_flagged = false`.
  - **Vendor Registration Flow (`POST /api/auth/register` with `role: 'vendor'`):**
    - Inputs: Account credentials (`name`, `email`, `phone`, `password`, `date_of_birth`) PLUS Business details (`business_name`, `business_type`, `verified_address`, `verified_location` coordinates via Nominatim geocoding, `opening_time`, `closing_time`, `city_density_tier`).
    - Atomically creates `users` record and linked `vendors` record (`user_id REFERENCES users(id)`).
  - **Unified Login with Role-Based Auto-Redirection (`POST /api/auth/login`):**
    - Validates credentials against `users` table; returns access/refresh JWT tokens and user metadata.
    - Frontend client inspects `user.role` from token payload and routes accordingly:
      - `role === 'consumer'` $\rightarrow$ Redirects to **Consumer Live Feed** (`/`).
      - `role === 'vendor'` $\rightarrow$ Redirects to **Vendor Dashboard & Snap-to-Post** (`/vendor/dashboard`).
      - `role === 'admin'` $\rightarrow$ Redirects to **Admin Verification & NGO Allowlist** (`/admin`).
  - **Role Guard Middleware (`roleGuard.js`):**
    - `requireRole('vendor')`: Enforces vendor-only access on `/api/vendor/*`, `/api/ai/*`. Rejects consumers with HTTP 403 Forbidden.
    - `requireRole('consumer')`: Enforces consumer-only access on `/api/deals/:id/claim`. Prevents vendors from claiming deals to eliminate self-dealing / conflict of interest.
    - `requireRole('admin')`: Protects `/api/admin/*` routes.
- **2.3 Age Verification Gate [COMP-1]:**
  - Registration validator computing: `age = differenceInYears(new Date(), dateOfBirth)`.
  - Immediate server rejection with HTTP 403 if `age < 13`.
- **2.4 Location Privacy & Ephemeral Guarantees [PROD-6]:**
  - Heartbeat endpoint `PATCH /api/users/location`: updates `current_location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)` and `location_updated_at = NOW()`.
  - Strict location minimization: NO location breadcrumbs or historical tracks saved; previous location is overwritten.
  - "Go Offline" handler: immediately clears `current_location = NULL`, terminates active SSE sockets, and invalidates presence in Redis.
  - Right to Erasure (`DELETE /api/users/me/data`): wipes user profile, claims older than 30-day dispute window, and anonymizes analytics logs.
- **2.5 Free OpenStreetMap Geocoding (`geocodingService.js`) [ARCH-8]:**
  - Integration with Nominatim (`https://nominatim.openstreetmap.org/search`).
  - Headers configured with required User-Agent (`egpp-food-rescue/1.0`).
  - 1 req/sec client-side throttling to ensure free API compliance without paid Mapbox dependency.
  - Coordinate locking: `verified_location` marked immutable once vendor profile is verified.


---

### Phase 3: Geospatial Matching & Real-Time Urgency Score (RUS) Engine
**Goal:** Deliver zero Cartesian-product spatial matching and composite urgency scoring.

- **3.1 Dynamic Radius Engine (`radiusEngine.js`):**
  - Base radius: 2000 meters.
  - Density multiplier: metro (0.6x), tier2 (1.0x), tier3/suburban (1.8x).
  - Time urgency multiplier: >45m (0.8x), 20–45m (1.0x), <20m (1.4x).
  - Quantity multiplier: 1–2 items (0.7x), 3–5 items (1.0x), 6+ items (1.3x).
  - Historical claim rate modifier: >80% (0.9x), <40% (1.2x).
  - Bounded clamping: `clamp(computedRadius, 500, 5000)` meters.
- **3.2 High-Performance PostGIS Geofence Query (`geospatialQueries.js`) [CRIT-1, ARCH-5]:**
  - Direct indexed JOIN: `FROM deals d JOIN users u ON ST_DWithin(u.current_location, d.deal_location, d.effective_radius_meters)`.
  - Mandatory predicates: `u.location_consent = true AND u.notifications_enabled = true AND u.is_flagged = false AND u.location_updated_at > NOW() - INTERVAL '15 minutes'`.
  - Elimination of Cartesian `CROSS JOIN` and elimination of the stale 7-day vendor exclusion filter [PROD-1].
- **3.3 5-Factor Real-Time Urgency Score Engine (`rusCalculator.js`) [PROD-2]:**
  - Factor 1: Time Pressure ($F_1$, weight 35%): `max(0, (60 - minutes_remaining) / 60) * 10`.
  - Factor 2: Scarcity ($F_2$, weight 30%): `max(0, (5 - items_remaining) / 5) * 10`.
  - Factor 3: Historical Claim Lag ($F_3$, weight 20%): `max(0, 10 - (avg_claim_lag / 120))`.
  - Factor 4: User Distance ($F_4$, weight 10%): `max(0, (2 - distance_km) / 2) * 10`.
  - Factor 5: Weather Mobility Multiplier ($F_5$, weight 5%): measures consumer travel likelihood. Heavy rain/extreme heat = `0.85`, clear/mild = `1.00`.
  - Calculation: $\text{RUS} = (F_1 \times 0.35 + F_2 \times 0.30 + F_3 \times 0.20 + F_4 \times 0.10 + F_5 \times 0.05) \times \text{WeatherModifier}$.
  - Label categorization: $\text{RUS} \ge 8.0 \implies \text{GOING\_NOW}$; $\text{RUS} \ge 5.0 \implies \text{ACT\_SOON}$; $\text{RUS} < 5.0 \implies \text{COMFORTABLE}$.

---

### Phase 4: Real-Time Event Dispatcher & Dual Push Mutual Exclusion
**Goal:** Deliver live notifications without connection leakage or duplicate notification spam.

- **4.1 SSE Connection Manager (`SSEManager.js`) [CRIT-5]:**
  - Endpoint `GET /api/sse/consumer`: sets headers (`text/event-stream`, `no-cache`, `keep-alive`), sets `res.setTimeout(0)`.
  - Heartbeat timer (15 seconds): transmits `: ping\n\n` comments; refreshes Redis key `sse:user:{userId}` with 30s TTL.
  - Connection teardown: handles `req.on('close')`, cleans up active user response pools, deletes Redis presence key.
- **4.2 SSE / FCM Deduplication Engine (`pushService.js`) [ARCH-4]:**
  - Logic checks: `const isConnectedOnSSE = await redis.exists('sse:user:' + userId);`.
  - If `isConnectedOnSSE === 1`: dispatches message exclusively via in-memory SSE socket.
  - If `isConnectedOnSSE === 0`: dispatches push via Firebase Admin SDK (FCM) and Web Push (VAPID).
- **4.3 Event Catalog:**
  - Consumer channel: `deal:new`, `deal:price_drop`, `deal:urgency_update`, `deal:claimed`, `deal:released`, `deal:expired`, `deal:ngo_handoff`, `deal:items_updated`.
  - Vendor channel: `claim:new`, `claim:expired`, `claim:cancelled`.

---

### Phase 5: ACID Concurrency Claim, QR Verification & State Machine
**Goal:** Prevent overselling race conditions and enforce strict state mutations.

- **5.1 ACID Claim Transaction (`claimController.js`) [CRIT-2]:**
  - Executes single SQL transaction with CTE lock:
    ```sql
    WITH claim_lock AS (
      UPDATE deals
      SET claimed_quantity = claimed_quantity + 1,
          status = CASE WHEN (claimed_quantity + 1) >= total_quantity THEN 'CLAIMED' ELSE 'PARTIALLY_CLAIMED' END
      WHERE id = $dealId AND status IN ('ACTIVE', 'PARTIALLY_CLAIMED') AND claimed_quantity < total_quantity
      RETURNING id, claimed_quantity, total_quantity, expires_at
    )
    INSERT INTO claims (deal_id, user_id, qr_token, qr_expires_at, confirmed_at)
    SELECT $dealId, $userId, gen_random_uuid()::text,
           LEAST(NOW() + INTERVAL '20 minutes', cl.expires_at - INTERVAL '5 minutes'), NOW()
    FROM claim_lock cl RETURNING *;
    ```
  - Rollback on zero rows with immediate HTTP 409 ("Deal already fully claimed or expired").
- **5.2 Voluntary Claim Cancellation Flow (`POST /api/deals/:id/claim/cancel`) [CRIT-4]:**
  - Checks claim is `CONFIRMED` and `picked_up_at IS NULL`.
  - Transactionally updates `claims.status = 'CANCELLED'`, decrements `deals.claimed_quantity`, and sets `deals.status = 'ACTIVE'`.
  - Emits `deal:released` via SSE and schedules immediate geospatial re-push.
  - Critical Policy: ZERO penalty on consumer reliability score for voluntary cancellation.
- **5.3 QR Verification & Pickup Confirmation:**
  - Vendor scans consumer QR (`POST /api/vendor/deals/:id/verify-pickup`).
  - Verifies `qr_token`, ensures `NOW() < qr_expires_at`, marks claim `PICKED_UP`.
  - Updates user metrics: `successful_pickups++`, recalculates `reliability_score = successful_pickups / GREATEST(total_claims, 1)`.
- **5.4 Deal Mutation Rules [PROD-4]:**
  - `expires_at`: can only be shortened, never extended (returns HTTP 400).
  - `total_quantity`: cannot be reduced below `claimed_quantity` (returns HTTP 409).
  - Price fields (`original_price`, `start_price`, `min_rescue_price`): immutable post-creation (returns HTTP 403).
  - Item updates: allowed, but triggers `deal:items_updated` SSE warning banner to confirmed claimants.

---

### Phase 6: BullMQ Asynchronous Background Worker System
**Goal:** Ensure fault-tolerant scheduling for pricing, sweeps, reminders, and NGO cascades.

- **6.1 Worker 1 — Deal Expiry Sweep (`dealExpiryWorker.js`):**
  - Delayed job scheduled at `deal.expires_at`.
  - Validates deal is `ACTIVE` or `PARTIALLY_CLAIMED`.
  - Updates status to `EXPIRED`, emits `deal:expired` SSE, logs deal snapshot into `vendor_analytics`.
- **6.2 Worker 2 — Claim Timeout & Auto-Release (`claimTimeoutWorker.js`):**
  - Scheduled delay: `LEAST(confirmed_at + 20m, expires_at - 5m)`.
  - If status is still `CONFIRMED`: marks `EXPIRED`, rolls back deal `claimed_quantity`, increments user `no_show_count`, recalculates reliability score. Flags account if `no_show_count > 3`.
- **6.3 Worker 3 — Urgency Score (RUS) Recalculator (`rusWorker.js`):**
  - Recurring 5-minute cron. Recalculates $F_1$–$F_5$, refreshes database records, and emits `deal:urgency_update`.
- **6.4 Worker 4 — Pickup Reminder Worker (`reminderWorker.js`):**
  - Delayed job firing at `confirmed_at + 10m`. Dispatches urgent push reminder to consumer.
- **6.5 Worker 5 — Weather Cache Refresher (`weatherWorker.js`):**
  - Cron every 30 minutes querying OpenWeatherMap API for active vendor cities, caching in Redis with 2100s TTL.
- **6.6 Worker 6 — Dutch Auction Price Dropper (`priceDroppingWorker.js`) [COMP-6]:**
  - Triggered at `deal.next_price_drop_at`. Computes linear step decrease toward `min_rescue_price`. Emits `deal:price_drop` event.
- **6.7 Worker 7 — Guarded NGO Handoff Cascade (`ngoHandoffWorker.js`) [CRIT-3, ARCH-3, COMP-2]:**
  - Triggered at `deal.expires_at - 15m`.
  - STRICT GUARD: Exits immediately if `deal.status != 'ACTIVE'` or `claimed_quantity > 0`.
  - If 0 claims: marks deal `NGO_HANDOFF`, emits SSE, and executes webhooks strictly to NGOs verified on the admin DPA allowlist.

---

### Phase 7: Python FastAPI AI Microservice (Hugging Face ViT + Dynamic Pricing)
**Goal:** Empower vendors with instant food recognition and ML dynamic pricing.

- **7.1 Service Architecture & Pre-Warming (`ai_service/`):**
  - FastAPI application with lifespan context loading PyTorch / Hugging Face model on startup.
  - Vision Transformer Model: `rajistics/finetuned-indian-food` (with fallback to `nateraw/food-101`).
- **7.2 Snap-to-Post Vision Pipeline (`vision_pipeline.py`):**
  - Accepts image binary / Cloudinary CDN URL.
  - Runs inference yielding Top-3 predictions with confidence ratings.
  - Confidence guard: if `< 0.50`, flags output for mandatory manual vendor confirmation.
- **7.3 Indian Food Taxonomy & Dietary Tag Mapper (`taxonomy_mapping.py`):**
  - Standardized dictionary mapping food labels (e.g., Samosa, Paneer Butter Masala, Biryani, Idli, Dosa, Croissant) to categories, dietary tags (`veg`, `vegan`, `dairy`, `gluten`), and baseline INR prices.
- **7.4 Dynamic Dutch Auction Suggester (`models/price_predictor.pkl`):**
  - Scikit-learn Random Forest regression model trained on input features (time until close, category, base price, weather, city density, claim lag).
  - Generates recommended Start Price, Minimum Rescue Price, and degradation interval.
- **7.5 Node.js Resilience & Circuit Breaker (`aiController.js`) [ARCH-2]:**
  - Backend requests Python microservice wrapped in `Promise.race([..., timeout(2000)])`.
  - If AI service fails or times out: falls back seamlessly to deterministic rule-based pricing table.

---

### Phase 8: Consumer PWA Frontend (React + Vite + Modern CSS)
**Goal:** Develop an ultra-responsive, accessible, and intuitive PWA with real-time SSE.

- **8.1 Styling & Design System:**
  - Modern, dark-mode-first aesthetic with custom CSS variables (no Tailwind dependency).
  - Micro-animations, responsive layouts, glassmorphic cards, and accessible typography (Inter / Outfit).
- **8.2 Pages & Core Views:**
  - `ConsentScreen.jsx`: DPDP legal consent explanation before triggering browser geolocation request.
  - `Auth.jsx`: Smart Role-Aware Authentication Portal featuring an intuitive role toggle: `[ 🥗 Rescue Food (Consumer) ]` vs `[ 🏪 Food Business (Vendor) ]`.
    - **Unified Login:** Single email/password interface; inspects returned JWT role and auto-redirects to `/` (Consumer) or `/vendor/dashboard` (Vendor).
    - **Consumer Sign-up:** Collects Name, Email/Phone, Password, and Date of Birth with live age validation ($\ge 13$).
    - **Vendor Sign-up:** Directs to comprehensive vendor onboarding with business profile and Nominatim store geocoding.
  - `HomeFeed.jsx`: Live SSE-driven deal stream dynamically sorted by Real-Time Urgency Score.
  - `DealDetail.jsx`: Comprehensive deal view with interactive countdown, live Dutch Auction price tracker, dietary labels, and Claim button.
  - `MyClaims.jsx`: List of claimed items with dynamic QR code rendering and voluntary cancel option.
  - `Profile.jsx`: Profile settings with one-tap "Go Offline" toggle (instantly revoking location and disconnecting SSE).
- **8.3 Key Interactive Components:**
  - `DealCard.jsx`: Card showing distance, discounted price, item badges, and urgency tags.
  - `RUSMeter.jsx`: Visual urgency arc (green to orange to pulsing red `GOING_NOW`).
  - `CountdownTimer.jsx`: Synchronized ticker tracking minutes to store closure.
  - `QRCodeDisplay.jsx`: High-contrast client-side QR token display for store scanning.
  - `CancelClaimButton.jsx`: Voluntary cancellation handler invoking atomic slot release.

---

### Phase 9: Vendor PWA Frontend (React + Vite + Camera Integration)
**Goal:** Deliver a frictionless, ultra-fast listing experience for busy vendors during closing rush.

- **9.1 Vendor Onboarding & Location Verification:**
  - `VendorOnboard.jsx`: Business registration form with Nominatim geocoding auto-complete.
  - Interactive Leaflet.js pin confirmation locking the immutable `verified_location`.
- **9.2 Snap-to-Post Camera Interface (`PostDeal.jsx`, `FoodImageCapture.jsx`):**
  - Native HTML5 Media Capture camera interface (`<input type="file" accept="image/*" capture="environment">`).
  - Direct preview -> Cloudinary upload -> AI classification -> instant form auto-fill with dish name, tags, and suggested Dutch Auction prices.
  - Full vendor manual override controls prior to publication.
- **9.3 Live Operations & Pickup Scanner:**
  - `VendorDashboard.jsx`: Real-time view of active deals, claimed inventory counters, and incoming claim feed via SSE.
  - `QRScanner.jsx`: Native camera-based QR scanner for rapid customer claim verification at pickup counter.
  - `Analytics.jsx`: Visual metrics showing total food saved (kg/items), revenue recovered, and claim speed heatmaps.

---

### Phase 10: Admin Panel, Nginx Gateway, Testing & End-to-End Validation
**Goal:** Implement administrative oversight, gateway proxying, and comprehensive integration testing.

- **10.1 Admin Oversight & NGO DPA Allowlist (`adminController.js`):**
  - Vendor verification portal for reviewing new onboarded food businesses.
  - NGO partner management with DPA compliance flags (only approved NGOs receive Worker 7 handoff webhooks).
- **10.2 Production Gateway Setup (`nginx.conf`):**
  - Configuration of SSE route bypass (`proxy_buffering off; proxy_read_timeout 65s; proxy_cache off; chunked_transfer_encoding on`).
  - API proxy routing and rate limit propagation.
- **10.3 Comprehensive Test Suite:**
  - Unit & Integration tests for ACID claim concurrency (simulating 50 concurrent claims on a 5-item deal).
  - PostGIS spatial query benchmark (testing indexed JOIN query speed under synthetic load).
  - AI microservice fallback tests (verifying graceful degradation when Python service is paused).
  - End-to-end simulation script validating the complete lifecycle from camera snapshot to pickup and TTL purge.

---

## File Structure Tree for Full Project

```
food/
├── docs/
│   ├── PROJECT_BLUEPRINT.md            # Architectural blueprint specification v1.2
│   ├── IMPLEMENTATION_PLAN.md          # This comprehensive master implementation plan
│   ├── journal_papers_references.md    # 25 conference papers survey
│   └── Zero_Waste_Presentation.tex     # Academic presentation source
│
├── ai_service/                         # Python FastAPI Microservice
│   ├── main.py                         # FastAPI startup & lifespan model pre-warming
│   ├── vision_pipeline.py              # Hugging Face ViT image classification
│   ├── taxonomy_mapping.py             # Food categories, dietary tags & benchmark prices
│   ├── pricing_model.py                # Dutch Auction pricing regression model
│   ├── requirements.txt                # fastapi, uvicorn, transformers, torch, pillow, scikit-learn
│   └── Dockerfile
│
├── backend/                            # Node.js Express REST & SSE Backend
│   ├── migrations/                     # Knex.js PostgreSQL/PostGIS migrations
│   │   ├── 01_enable_postgis.js
│   │   ├── 02_create_users.js
│   │   ├── 03_create_vendors.js
│   │   ├── 04_create_deals.js
│   │   ├── 05_create_claims.js
│   │   └── 06_create_vendor_analytics.js
│   ├── seeds/                          # Realistic development seeds
│   │   └── 01_initial_data.js
│   ├── src/
│   │   ├── app.js                      # Express app configuration & middleware
│   │   ├── server.js                   # HTTP server startup & socket listener
│   │   ├── config/
│   │   │   ├── db.js                   # Knex PostgreSQL connection
│   │   │   ├── redis.js                # Redis client connection
│   │   │   └── firebase.js             # FCM admin SDK initialization
│   │   ├── controllers/
│   │   │   ├── authController.js       # Register, login, refresh, logout
│   │   │   ├── dealController.js       # Post deal, get nearby, mutation rules
│   │   │   ├── claimController.js      # ACID claim transaction, voluntary cancel
│   │   │   ├── aiController.js         # Snap-to-Post bridge with timeout circuit breaker
│   │   │   ├── vendorController.js     # Onboarding, live dashboard, QR pickup verification
│   │   │   ├── userController.js       # Location heartbeat, notification preferences
│   │   │   ├── privacyController.js    # DPDP consent, Go Offline, right to erasure
│   │   │   └── adminController.js      # Vendor approval, NGO DPA allowlist
│   │   ├── services/
│   │   │   ├── radiusEngine.js         # Multi-factor dynamic push radius calculator
│   │   │   ├── rusCalculator.js        # 5-factor Real-Time Urgency Score calculator
│   │   │   ├── pushService.js          # Dual push dispatcher with SSE/FCM mutual exclusion
│   │   │   ├── geocodingService.js     # Free Nominatim OpenStreetMap geocoding
│   │   │   └── weatherService.js       # OpenWeatherMap API caller & Redis cache
│   │   ├── workers/                    # BullMQ Background Job Processors
│   │   │   ├── dealExpiryWorker.js     # Worker 1: Deal TTL sweep
│   │   │   ├── claimTimeoutWorker.js   # Worker 2: 20-min claim timeout & auto-release
│   │   │   ├── rusWorker.js            # Worker 3: 5-min RUS recalculation
│   │   │   ├── reminderWorker.js       # Worker 4: 10-min pickup reminder
│   │   │   ├── weatherWorker.js        # Worker 5: 30-min weather cache refresh
│   │   │   ├── priceDroppingWorker.js  # Worker 6: Dutch Auction linear price dropper
│   │   │   └── ngoHandoffWorker.js     # Worker 7: Guarded NGO handoff cascade
│   │   ├── sse/
│   │   │   ├── SSEManager.js           # 15s heartbeat, connection pool, cleanup
│   │   │   └── sseEvents.js            # Standardized SSE event payload formatters
│   │   ├── queries/
│   │   │   ├── geospatialQueries.js    # Indexed PostGIS ST_DWithin queries
│   │   │   └── dealQueries.js
│   │   ├── middleware/
│   │   │   ├── auth.js                 # JWT verification & Redis blacklist check
│   │   │   ├── roleGuard.js            # Consumer vs Vendor vs Admin RBAC
│   │   │   └── rateLimiter.js          # Route-specific rate limits
│   │   └── routes/
│   │       ├── auth.routes.js
│   │       ├── deal.routes.js
│   │       ├── claim.routes.js
│   │       ├── ai.routes.js
│   │       ├── vendor.routes.js
│   │       ├── user.routes.js
│   │       ├── sse.routes.js
│   │       └── admin.routes.js
│   ├── .env.example
│   └── package.json
│
├── frontend/                           # React + Vite Progressive Web App (PWA)
│   ├── public/
│   │   ├── manifest.json               # PWA configuration
│   │   ├── service-worker.js           # Web Push & background notification handler
│   │   └── icons/
│   ├── src/
│   │   ├── main.jsx                    # React root mounting
│   │   ├── App.jsx                     # Router & global context providers
│   │   ├── context/
│   │   │   ├── AuthContext.jsx         # User state & JWT persistence
│   │   │   ├── SSEContext.jsx          # Live SSE stream subscription
│   │   │   └── DealContext.jsx         # Active deals cache
│   │   ├── hooks/
│   │   │   ├── useSSE.js               # Hook consuming SSE events
│   │   │   ├── useLocation.js          # GPS watch & 10-min heartbeat
│   │   │   └── useCountdown.js         # Synchronized countdown clock
│   │   ├── pages/
│   │   │   ├── ConsentScreen.jsx       # DPDP consent modal
│   │   │   ├── Auth.jsx                # Login / Register with age gate DOB
│   │   │   ├── HomeFeed.jsx            # Live consumer deal feed sorted by RUS
│   │   │   ├── DealDetail.jsx          # Deal countdown, Dutch Auction, Claim
│   │   │   ├── MyClaims.jsx            # Dynamic QR codes & voluntary cancellation
│   │   │   ├── Profile.jsx             # Settings & "Go Offline" button
│   │   │   └── vendor/
│   │   │       ├── VendorOnboard.jsx   # Nominatim address geocoding + Leaflet
│   │   │       ├── PostDeal.jsx        # Snap-to-Post camera & AI pricing
│   │   │       ├── VendorDashboard.jsx # Live claim stream & deal status
│   │   │       ├── QRScanner.jsx       # Camera QR verification scanner
│   │   │       └── Analytics.jsx       # Food rescue statistics & heatmaps
│   │   ├── components/
│   │   │   ├── FoodImageCapture.jsx    # Native camera capture widget
│   │   │   ├── DealCard.jsx            # Deal card with RUS badge
│   │   │   ├── RUSMeter.jsx            # Visual urgency arc
│   │   │   ├── CountdownTimer.jsx      # Clock timer
│   │   │   ├── QRCodeDisplay.jsx       # Fullscreen QR code
│   │   │   ├── CancelClaimButton.jsx   # Voluntary cancellation button
│   │   │   └── MapView.jsx             # Leaflet deal & radius map
│   │   └── styles/
│   │       ├── index.css               # Design system & tokens
│   │       ├── components.css          # Component styling
│   │       └── pages.css               # Page layouts
│   ├── .env.example
│   └── package.json
│
├── docker-compose.yml                  # PostgreSQL/PostGIS, Redis, Nginx services
└── nginx.conf                          # Reverse proxy configuration for SSE
```

---

## Verification & Validation Plan

### 1. Automated Integration & Unit Testing
- **ACID Claim Concurrency Test (`test/claimConcurrency.test.js`):**
  - Execute 50 concurrent asynchronous HTTP requests attempting to claim a deal with `total_quantity = 5`.
  - Assert that exactly 5 requests receive HTTP 201 (`CONFIRMED`) and 45 requests receive HTTP 409 (`ALREADY_CLAIMED`).
  - Assert `deals.claimed_quantity` strictly equals 5 and `status = 'CLAIMED'`.
- **PostGIS Spatial Matching Test (`test/geospatial.test.js`):**
  - Insert mock consumers at 400m, 1.5km, 3km, and 6km from a test deal with an effective radius of 2000m.
  - Run `geospatialQueries.findEligibleUsers()`.
  - Assert that only users at 400m and 1.5km are returned.
  - Update user location timestamp to 20 minutes ago; assert user is excluded due to the 15-min freshness predicate.
- **Voluntary Cancellation Test (`test/cancelClaim.test.js`):**
  - Claim a deal, confirm status, then invoke `POST /api/deals/:id/claim/cancel`.
  - Assert deal quantity rolls back from 1 to 0 and claim is marked `CANCELLED`.
  - Assert user `no_show_count` remains 0 and `reliability_score` remains 1.00.
- **AI Microservice Timeout & Circuit Breaker Test (`test/aiFallback.test.js`):**
  - Mock Python FastAPI service with a 3000ms delay.
  - Trigger `POST /api/ai/snap-to-post`.
  - Assert Node.js backend times out at 2000ms and returns deterministic default pricing rules without crashing.

### 2. Manual End-to-End Walkthrough Scenario
1. **Vendor Registration & Address Geocoding:** Vendor registers, types address, confirms pin on Leaflet map; backend saves immutable PostGIS point.
2. **Snap-to-Post Deal Creation:** Vendor uses camera to snap food; ViT identifies dish, auto-selects tags, and populates Dutch Auction prices; vendor clicks "Post Deal".
3. **Dynamic Radius & Push Trigger:** Backend calculates 1800m radius; PostGIS identifies active nearby users; pushes `deal:new` via SSE / FCM.
4. **Consumer Live Feed & Urgency:** Consumer receives SSE event; deal card renders with high RUS badge (`GOING_NOW`) and live price degradation countdown.
5. **ACID Claim & QR Generation:** Consumer taps Claim; atomic transaction locks slot; client generates QR with `qr_expires_at` countdown.
6. **Pickup Verification:** Vendor opens QR scanner, scans consumer phone; backend verifies token and marks `PICKED_UP`; consumer reliability score updates.
7. **Unsold Expiry & NGO Cascade Simulation:** In an uncollected deal scenario, verify Worker 7 checks `claimed_quantity == 0` at T-15m and fires webhook to DPA-approved NGO.
