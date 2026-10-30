# Ephemeral Geospatial Push Protocol (EGPP)
### Zero-Waste Food Rescue Platform — Full Project Blueprint
### v1.2 — Snap-to-Post Vision AI Enhanced (Hugging Face ViT + Dynamic Pricing)

---

## Table of Contents

1. Project Summary
2. Core Philosophy
3. System Architecture Overview
4. Tech Stack
5. Database Design
6. State Machines
7. API Design
8. Real-Time Layer (SSE + Web Push)
9. Geospatial Engine
10. Urgency Score Engine (RUS)
11. AI and Machine Learning Layer
12. Background Worker System
13. Critical Implementation Notes
14. Flaw Corrections Applied
15. Feature List
16. Frontend Pages and Components
17. Compliance and Privacy (DPDP + GDPR)
18. Folder Structure
19. Environment Variables
20. Future Roadmap

---

## 1. Project Summary

**Ephemeral Geospatial Push Protocol (EGPP)** is a hyper-local, event-driven food rescue marketplace that connects local food vendors with nearby users in the final minutes before closing time.

### The Problem
- Local food vendors discard massive unsold inventory at closing time every single day.
- Existing platforms (Too Good To Go, Karma, OLIO) rely on static pull architectures or opaque mystery bags.
- No platform uses event-driven geospatial push to actively find nearby users at the moment surplus occurs.

### The Solution
- Vendor posts exact, transparent inventory near closing time.
- Backend uses PostGIS spatial queries (indexed JOIN, not Cartesian product) to identify users within a dynamically calculated radius.
- Backend actively pushes the deal via SSE (in-app) + Web Push/FCM (background), with mutual exclusion to prevent duplicate notifications.
- Dutch Auction Pricing Model dynamically degrades price as closing time approaches.
- Automated NGO Handoff fires ONLY if items are completely unsold (zero claims) 15 minutes before closing.
- Deal data has a hard server-enforced TTL with defined retention windows.
- A Real-Time Urgency Score (RUS) tells the user exactly how urgently they need to act.

---

## 2. Core Philosophy

| Principle | Implementation |
|---|---|
| Push not Pull | Server pushes deals to users; users never need to browse |
| Transparency not Mystery | Exact items listed, not surprise bags |
| Dynamic Price Degradation | Dutch Auction pricing forces immediate action; prevents cannibalization |
| Zero Waste Guarantee | NGO Handoff fires only when zero claims exist — true last resort |
| Short-Lived by Design | Hard TTL; expired data swept server-side; retained in defined audit windows only |
| Spatial Precision | PostGIS geography calculations with GIST-indexed JOINs |
| Privacy First | Location used to match only; never stored as history; consent required |
| Vendor-First Economics | Vendor recovers cost; v1 cash-at-pickup; revenue via vendor subscription |

> **ARCH-1 FIX — Honest Retention Policy:** Deal metadata retained 24h post-expiry for audit/support. Claims retained 30 days for dispute resolution. Anonymized vendor analytics retained indefinitely. Location data is current-snapshot only — no history. The previous "strictly ephemeral" wording contradicted the compliance section and is corrected here.

---

## 3. System Architecture Overview

```
+----------------------------------------------------------------------+
|                         VENDOR PWA (React)                           |
|  [ Snap-to-Post 📷 ] --> [ Inventory Form ] --> [ Live Dashboard ]    |
+-----------+--------------------+-------------------------------------+
            | Multipart Image    | HTTP POST /api/deals
            v                    v
+----------------------------------------------------------------------+
|                      NODE.JS / EXPRESS BACKEND                       |
|                                                                      |
|  +-----------------+    +------------------+    +----------------+  |
|  | Deal Controller  |--->  Geospatial Engine |--->   Push Engine  |  |
|  | (ACID Txn Claim) |    | (PostGIS indexed  |    | (SSE+FCM,     |  |
|  |  CRIT-2 fixed    |    |  JOIN, CRIT-1)   |    |  deduplicated)|  |
|  +-----------------+    +------------------+    +----------------+  |
|           |                                              |            |
|  +--------v---------+    +------------------+           |            |
|  |  State Machine   |    |  RUS Calculator  |           |            |
|  | (+ CANCELLED st) |    | (Urgency Score)  |           |            |
|  +------------------+    +------------------+           |            |
+------+--------------------------------------------+----+--+
       |                                                |
       | Upload image (Multer -> Cloudinary CDN)        |
       | GET / POST /api/ai/snap-to-post                |
       v                                                v
+-------------+    +------------------------+    +----------------+
| Cloudinary  |    |         Redis          |    |  FCM / Web     |
| Image CDN   |    |  + BullMQ              |    |  Push Service  |
|             |    |  + JWT Refresh Blocklist|    |  (only when    |
|             |    |  + SSE Presence Map    |    |   NOT on SSE)  |
+------+------+    +----------+-------------+    +----------------+
       |                      |
       | Image URL            v
       v      +--------------------------------+
+-------------+      Background Workers        |
| PostgreSQL  |  1. TTL Sweep                  |
| + PostGIS   |  2. Claim Timeout              |
|             |  3. RUS Recalculator           |
|             |  4. Pickup Reminder            |
|             |  5. Weather Refresh            |
|             |  6. Price Degradation          |
|             |  7. NGO Handoff (guarded)      |
|             +--------------------------------+
|                             |
|                             v
+----------------------------------------------------------------------+
|                      PYTHON AI MICROSERVICE                          |
|   [ FastAPI ]                                                        |
|   ├── [ Hugging Face ViT Vision Engine ] (Food Recognition)          |
|   │   (rajistics/finetuned-indian-food / nateraw/food-101)           |
|   ├── [ Food Taxonomy & Dietary Tag Mapper ]                         |
|   └── [ scikit-learn / XGBoost ] (Dynamic Price Suggester)           |
|   Pre-warmed on startup | Graceful Fallback if service unavailable  |
+----------------------------------------------------------------------+
                              |
                              v
+----------------------------------------------------------------------+
|                        USER PWA (React)                              |
|   [ SSE Live Feed ] [ Deal Cards w/ RUS ] [ Claim/Cancel ] [ QR ]   |
+----------------------------------------------------------------------+
```

---

## 4. Tech Stack

### Frontend
| Layer | Technology | Reason |
|---|---|---|
| Framework | React.js (PWA) | Cross-platform, installable on mobile |
| Styling | Vanilla CSS + CSS Variables | Maximum control, no framework lock-in |
| Real-Time | EventSource API (SSE) | Built-in browser reconnection |
| Background Push | Web Push API + Service Worker | Receives notifications when app is closed |
| Maps | Leaflet.js + OpenStreetMap | Free, no API key required for tiles |
| Camera / Capture | HTML5 Media Capture API | Zero external dependencies, native device camera integration |
| QR Code | qrcode.react | Client-side QR generation |
| State Management | React Context + useReducer | Lightweight, no Redux overhead |
| Routing | React Router v6 | Standard SPA routing |

### Backend
| Layer | Technology | Reason |
|---|---|---|
| Runtime | Node.js 20 LTS | Non-blocking I/O; perfect for SSE |
| Framework | Express.js | Minimal, composable |
| ORM | Knex.js (query builder) | Full SQL control for PostGIS functions |
| Geospatial | PostgreSQL 16 + PostGIS 3.4 | Industry-standard spatial database |
| Job Queue | Redis 7 + BullMQ | Delayed jobs, TTL sweep scheduling |
| Push Notifications | Firebase Admin SDK (FCM) | OS-level background delivery |
| Authentication | JWT + Redis Blocklist | Stateless with server-side refresh invalidation on logout |
| File Uploads | Multer + Cloudinary | Vendor food item images & Snap-to-Post raw captures |
| Geocoding | Nominatim API (OpenStreetMap) free no API key | Vendor address to lat/lng at onboarding; low-frequency |
| Weather Data | OpenWeatherMap API (Free tier) | For RUS weather mobility factor |
| Validation | Zod | Runtime schema validation |
| Logging | Winston + Morgan | Structured logs |

> **ARCH-8 FIX:** Previous blueprint referenced Mapbox Geocoding (paid, commercial restrictions). Replaced with Nominatim (OpenStreetMap) which is genuinely free. The 1 req/sec rate limit is acceptable for low-frequency vendor onboarding. No MAPBOX_ACCESS_TOKEN required anywhere.

### AI and Machine Learning
| Layer | Technology | Reason |
|---|---|---|
| AI Microservice | Python 3.11 + FastAPI | Lightweight, high-performance async API |
| Vision AI (Image Recognition) | Hugging Face Transformers / Inference API | Pre-trained Vision Transformer (ViT) fine-tuned for food classification (`rajistics/finetuned-indian-food` / `nateraw/food-101`) |
| Image Processing | Pillow (PIL) + torchvision | Fast client/server side preprocessing & tensor formatting |
| Dynamic Pricing | scikit-learn / XGBoost | Classic ML for pricing/demand prediction (CPU-friendly) |
| Data Processing | Pandas + NumPy | Data manipulation for model training and taxonomy lookup |

### DevOps / Infrastructure
| Layer | Technology |
|---|---|
| Containerization | Docker + Docker Compose |
| Process Manager | PM2 (production) |
| Reverse Proxy | Nginx (proxy_read_timeout 65s; proxy_buffering off for SSE routes) |
| Database Migrations | Knex migrate |
| Environment Config | dotenv |

---

## 5. Database Design

### Table: users
```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  phone           VARCHAR(20),
  password_hash   TEXT NOT NULL,
  role            VARCHAR(20) DEFAULT 'consumer',

  -- COMP-1 FIX: Age gate enforced server-side via DOB field.
  -- Registration rejected if: date_of_birth > NOW() - INTERVAL '13 years'
  date_of_birth   DATE NOT NULL,

  -- Location (current snapshot only, no history stored)
  current_location     GEOGRAPHY(Point, 4326),
  location_updated_at  TIMESTAMPTZ,

  -- Push delivery
  fcm_token            TEXT,
  push_subscription    JSONB,
  notifications_enabled BOOLEAN DEFAULT true,

  -- Privacy and compliance
  location_consent     BOOLEAN DEFAULT false,
  location_consent_at  TIMESTAMPTZ,
  data_processing_consent BOOLEAN DEFAULT false,

  -- Reputation (no-show tracking)
  -- ARCH-6 FIX: Formula defined explicitly:
  --   reliability_score = successful_pickups / GREATEST(total_claims, 1)
  --   Range: 0.00-1.00 | Default: 1.00 | Recalculated after every claim outcome
  total_claims         INTEGER DEFAULT 0,
  successful_pickups   INTEGER DEFAULT 0,
  no_show_count        INTEGER DEFAULT 0,
  reliability_score    DECIMAL(3,2) DEFAULT 1.00,
  is_flagged           BOOLEAN DEFAULT false,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_location ON users USING GIST (current_location);
CREATE INDEX idx_users_location_updated ON users (location_updated_at);
```

### Table: vendors
```sql
CREATE TABLE vendors (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  business_name       VARCHAR(200) NOT NULL,
  business_type       VARCHAR(100),

  -- Verified, locked address (immutable after onboarding)
  verified_address    TEXT NOT NULL,
  verified_location   GEOGRAPHY(Point, 4326) NOT NULL,
  city                VARCHAR(100),
  pincode             VARCHAR(20),
  city_density_tier   VARCHAR(20) DEFAULT 'tier2', -- metro | tier2 | tier3

  -- Onboarding verification
  is_verified         BOOLEAN DEFAULT false,
  verification_method VARCHAR(50),
  verified_at         TIMESTAMPTZ,

  -- Business hours
  opening_time        TIME,
  closing_time        TIME,

  -- Analytics
  total_deals_posted      INTEGER DEFAULT 0,
  total_items_rescued     INTEGER DEFAULT 0,
  total_revenue_recovered DECIMAL(12,2) DEFAULT 0,
  avg_claim_rate          DECIMAL(5,2) DEFAULT 0,
  avg_claim_lag_secs      INTEGER DEFAULT 600,

  logo_url            TEXT,
  cover_image_url     TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendors_location ON vendors USING GIST (verified_location);
```

### Table: deals
```sql
CREATE TABLE deals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         UUID REFERENCES vendors(id) ON DELETE CASCADE,

  -- Inventory (transparent, not mystery)
  title             VARCHAR(200) NOT NULL,
  description       TEXT,
  items             JSONB NOT NULL,
  image_url         TEXT,
  dietary_tags      TEXT[],  -- ['veg', 'vegan', 'contains_gluten']

  -- Pricing (Dutch Auction)
  original_price     DECIMAL(10,2) NOT NULL,
  start_price        DECIMAL(10,2) NOT NULL,
  current_price      DECIMAL(10,2) NOT NULL,
  min_rescue_price   DECIMAL(10,2) NOT NULL,
  next_price_drop_at TIMESTAMPTZ,
  platform_fee       DECIMAL(10,2), -- Reserved for v2 in-app payments; unused in v1

  -- Inventory tracking
  total_quantity    INTEGER NOT NULL DEFAULT 1,
  claimed_quantity  INTEGER NOT NULL DEFAULT 0,

  -- State machine
  status            VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  -- ACTIVE | CLAIMED | PARTIALLY_CLAIMED | EXPIRED | CANCELLED | NGO_HANDOFF

  -- Temporal
  expires_at        TIMESTAMPTZ NOT NULL,
  posted_at         TIMESTAMPTZ DEFAULT NOW(),

  -- Geospatial (immutable snapshot of vendor location at post time)
  deal_location     GEOGRAPHY(Point, 4326) NOT NULL,

  -- Dynamic radius (computed by RadiusEngine on post)
  effective_radius_meters INTEGER NOT NULL DEFAULT 2000,

  -- Urgency Score
  urgency_score     DECIMAL(4,2) DEFAULT 0,
  urgency_label     VARCHAR(20) DEFAULT 'COMFORTABLE',
  rus_updated_at    TIMESTAMPTZ,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deals_status    ON deals (status);
CREATE INDEX idx_deals_expires   ON deals (expires_at);
CREATE INDEX idx_deals_location  ON deals USING GIST (deal_location);
CREATE INDEX idx_deals_vendor    ON deals (vendor_id);
```

### Table: claims
```sql
CREATE TABLE claims (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         UUID REFERENCES deals(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Claim state
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  -- PENDING | CONFIRMED | PICKED_UP | EXPIRED | CANCELLED

  -- QR Code
  qr_token      TEXT UNIQUE NOT NULL,
  -- PROD-3 FIX: qr_expires_at computed as:
  --   LEAST(NOW() + INTERVAL '20 minutes', deal.expires_at - INTERVAL '5 minutes')
  -- If vendor shortens expires_at, all CONFIRMED claims qr_expires_at are recomputed.
  qr_expires_at TIMESTAMPTZ NOT NULL,

  -- Timestamps
  claimed_at    TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ,   -- set on PENDING to CONFIRMED
  picked_up_at  TIMESTAMPTZ,
  expired_at    TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,   -- CRIT-4 FIX: set on voluntary cancellation

  reminder_sent BOOLEAN DEFAULT false,

  UNIQUE (deal_id, user_id)
);

CREATE INDEX idx_claims_deal    ON claims (deal_id);
CREATE INDEX idx_claims_user    ON claims (user_id);
CREATE INDEX idx_claims_status  ON claims (status);
CREATE INDEX idx_claims_qr      ON claims (qr_token);
CREATE INDEX idx_claims_expires ON claims (qr_expires_at);
```

### Table: vendor_analytics
```sql
CREATE TABLE vendor_analytics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id  UUID REFERENCES vendors(id) ON DELETE CASCADE,

  -- COMP-4 FIX: ON DELETE SET NULL prevents dangling FK after deal purge (24h post-expiry).
  -- Snapshot columns capture deal context at write time so analytics survive deal purge.
  deal_id              UUID REFERENCES deals(id) ON DELETE SET NULL,
  deal_title_snapshot  VARCHAR(200),
  deal_price_snapshot  DECIMAL(10,2),

  event_type      VARCHAR(50),
  items_rescued   INTEGER DEFAULT 0,
  revenue_amount  DECIMAL(10,2) DEFAULT 0,
  users_notified  INTEGER DEFAULT 0,
  claim_lag_secs  INTEGER,

  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_vendor      ON vendor_analytics (vendor_id);
CREATE INDEX idx_analytics_recorded    ON vendor_analytics (recorded_at);
-- COMP-5 FIX: Composite index for vendor time-series dashboard queries
-- Covers: WHERE vendor_id = $1 ORDER BY recorded_at DESC
CREATE INDEX idx_analytics_vendor_time ON vendor_analytics (vendor_id, recorded_at DESC);
```

---

## 6. State Machines

### Deal State Machine

```
                    +--------------+
                    |    ACTIVE    | <--- Vendor posts deal
                    +------+-------+
                           |
             +-------------+---------------+
             |             |               |
             v             v               v
     +--------------+  +----------+  +-----------+
     |   CLAIMED    |  |PARTIALLY |  | CANCELLED | <-- Vendor cancels
     | (all qty     |  | CLAIMED  |  +-----------+
     |  taken)      |  |(some qty)|
     +--------------+  +----+-----+
                            |
                    Claim timeout fires
                    (BullMQ delayed job)
                            |
                            v
                    +--------------+
                    |    ACTIVE    | <--- Re-pushed to nearby users
                    +--------------+
                            |
        T-15 mins AND claimed_quantity == 0
        [ARCH-3 + CRIT-3 FIX: guard prevents firing when claims exist]
                            |
                            v
                    +--------------+
                    | NGO_HANDOFF  | --> Webhook to DPA-signed NGOs only
                    +--------------+
                            |
                       TTL expires
                            |
                            v
                    +--------------+
                    |   EXPIRED    | --> SSE deal:expired event fired
                    +--------------+
```

### Claim State Machine

```
                    +--------------+
                    |   PENDING    | <--- User hits Claim
                    +------+-------+
                           |
                           v
                    +--------------+
                    |  CONFIRMED   | --> QR code generated
                    +------+-------+
                           |
          +----------------+-------------------+
          |                |                   |
  User scans QR     20-min timeout OR    User cancels
  at store before   store closes         before pickup
  timeout           without scan         (voluntary)
          |                |                   |
          v                v                   v
   +-------------+  +--------------+   +--------------+
   |  PICKED_UP  |  |   EXPIRED    |   |  CANCELLED   |
   +-------------+  +--------------+   +--------------+
                     --> Slot released   --> Slot released
                         no_show_count++     (no penalty)
                         score recalculated  Vendor notified

CRIT-4 FIX: CANCELLED state is wired in both state machine and API.
POST /api/deals/:id/claim/cancel implements atomic slot release.
No no-show penalty is applied for voluntary cancellations.
```

---

## 7. API Design

### Auth Routes
| Method | Endpoint | Description | Rate Limit |
|---|---|---|---|
| POST | /api/auth/register | Register consumer or vendor; validates age via DOB | 5 req/15min/IP |
| POST | /api/auth/login | Login, returns JWT access and refresh pair | 10 req/15min/IP |
| POST | /api/auth/refresh | Refresh access token; checks Redis blocklist | 20 req/15min/IP |
| POST | /api/auth/logout | DEL refresh token from Redis blocklist | -- |

### User Routes
| Method | Endpoint | Description | Rate Limit |
|---|---|---|---|
| PATCH | /api/users/location | Update current GPS location (heartbeat) | 1 req/10min/user |
| GET | /api/users/me | Get own profile | 60 req/min/user |
| PATCH | /api/users/notifications | Toggle notification preferences | -- |
| POST | /api/users/push-subscription | Register Web Push subscription | -- |
| DELETE | /api/users/push-subscription | Unsubscribe from push | -- |
| DELETE | /api/users/me/data | DPDP right to erasure | -- |

### Deal Routes (Consumer)
| Method | Endpoint | Description | Rate Limit |
|---|---|---|---|
| GET | /api/deals/nearby | Active deals in user radius | 30 req/min/user |
| GET | /api/deals/:id | Deal details + current RUS | 60 req/min/user |
| POST | /api/deals/:id/claim | Claim deal (ACID transaction: inventory + claim atomic) | 5 req/min/user |
| POST | /api/deals/:id/claim/cancel | Cancel CONFIRMED claim; slot released; no penalty | 10 req/min/user |
| GET | /api/deals/:id/claim/status | Own claim status | 60 req/min/user |

### Deal Routes (Vendor)
| Method | Endpoint | Description | Rate Limit |
|---|---|---|---|
| POST | /api/vendor/deals | Post new deal; triggers geospatial push | 10 req/hour/vendor |
| GET | /api/vendor/deals | Own posted deals | 60 req/min/vendor |
| PATCH | /api/vendor/deals/:id | Update deal (constrained; see mutation rules) | 20 req/min/vendor |
| DELETE | /api/vendor/deals/:id | Cancel deal | -- |
| POST | /api/vendor/deals/:id/verify-pickup | Scan QR, confirm pickup | -- |

#### PROD-4 FIX: Deal PATCH Mutation Rules (enforced server-side)
| Field | Rule |
|---|---|
| expires_at | Can only be SHORTENED, never extended. Returns 400 if new value later than current. |
| total_quantity | Cannot be set below claimed_quantity. Returns 409 if attempted. |
| items (JSONB) | Freely editable, BUT triggers deal:items_updated SSE to CONFIRMED claimants. |
| title, description, dietary_tags, image_url | Freely editable. |
| original_price, start_price, min_rescue_price | Immutable after posting. Returns 403 if attempted. |

### AI & Vision Routes (Vendor)
| Method | Endpoint | Description | Rate Limit |
|---|---|---|---|
| POST | /api/ai/snap-to-post | Upload food photo -> Cloudinary CDN -> Hugging Face ViT model inference -> returns classified items, dietary tags, and price suggestions | 20 req/hour/vendor |
| POST | /api/ai/price-suggest | Get ML dynamic pricing suggestions based on inventory & time | 60 req/min/vendor |

### Analytics Routes (Vendor)
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/vendor/analytics/summary | Overall rescue stats |
| GET | /api/vendor/analytics/deals | Per-deal breakdown |
| GET | /api/vendor/analytics/heatmap | Best times/days to post |

### SSE Routes
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/sse/consumer | Consumer SSE stream |
| GET | /api/sse/vendor/:dealId | Vendor SSE stream |

### Admin Routes
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/admin/vendors | Vendor verification queue |
| PATCH | /api/admin/vendors/:id/verify | Approve vendor |
| GET | /api/admin/analytics | Platform-wide stats |
| GET | /api/admin/ngo-partners | View DPA-signed NGO partner allowlist |
| POST | /api/admin/ngo-partners | Register new NGO partner (requires DPA on file) |

---

### PROD-5 FIX: Payment Model v1 (Cash at Pickup, Subscription Revenue)

v1 is deliberately payment-gateway-free. Consumers pay cash at pickup. Platform earns via monthly vendor subscriptions.

| Tier | Monthly Fee | Deals/Month | Extras |
|---|---|---|---|
| Starter | Free | Up to 10 deals | Basic analytics |
| Rescue Partner | Rs. 499 | Unlimited | Full analytics + heatmap |
| Chain | Rs. 1999 | Multi-outlet | API access + custom NGO config |

The platform_fee column and PLATFORM_FEE_PERCENT env var are reserved for v2 in-app payments (Razorpay). They are inactive in v1.

---

## 8. Real-Time Layer (SSE + Web Push)

### CRIT-5 FIX: SSE Connection Management

All SSE connections MUST implement the following to prevent memory leaks and zombie connections at scale.

```javascript
// SSEManager.js
app.get('/api/sse/consumer', authenticateJWT, (req, res) => {
  const userId = req.user.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setTimeout(0); // CRITICAL: disables Express default socket timeout

  // Mark user as SSE-present (30s TTL, refreshed by heartbeat)
  redis.set('sse:user:' + userId, 1, 'EX', 30);
  sseManager.addConnection(userId, res);

  // Heartbeat every 15s: keeps proxy alive + detects dead clients
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
    redis.set('sse:user:' + userId, 1, 'EX', 30);
  }, 15000);

  // CRITICAL: Immediately clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    sseManager.removeConnection(userId);
    redis.del('sse:user:' + userId);
  });
});
```

Required Nginx config:
```nginx
location /api/sse/ {
  proxy_pass http://backend;
  proxy_read_timeout 65s;
  proxy_buffering off;
  proxy_cache off;
  chunked_transfer_encoding on;
}
```

### ARCH-4 FIX: SSE / FCM Deduplication

SSE and FCM are exclusive, not stacked. A user watching the app must never receive both an in-app SSE update AND a simultaneous FCM pop-up.

```javascript
// pushService.js
async function notifyUser(userId, payload) {
  const isOnSSE = await redis.exists('sse:user:' + userId);
  if (isOnSSE) {
    sseManager.sendToUser(userId, payload);
  } else {
    if (user.fcm_token) await fcm.sendToDevice(user.fcm_token, payload);
    if (user.push_subscription) await webpush.sendNotification(user.push_subscription, payload);
  }
}
```

### ARCH-5 FIX: Stale Location Policy

Users with location_updated_at older than 15 minutes are excluded from the geospatial JOIN. They receive neither SSE nor FCM push. When they open the app, they are prompted to refresh location before seeing deals.

### SSE Event Types: Consumer Stream

```
EVENT: deal:new
Payload: { dealId, vendorName, title, items[], currentPrice, minRescuePrice,
           originalPrice, expiresAt, distanceMeters, urgencyScore,
           urgencyLabel, dealLocation }

EVENT: deal:price_drop
Payload: { dealId, currentPrice, nextPriceDropAt }

EVENT: deal:ngo_handoff
Payload: { dealId }

EVENT: deal:urgency_update
Payload: { dealId, urgencyScore, urgencyLabel, minutesRemaining, itemsRemaining }

EVENT: deal:claimed
Payload: { dealId, itemsRemaining, status }

EVENT: deal:expired
Payload: { dealId }

EVENT: deal:released
Payload: { dealId, itemsRemaining, status: 'ACTIVE' }

EVENT: deal:items_updated
Payload: { dealId, items[], message: 'Vendor updated the item list' }
-- Shown as warning banner to CONFIRMED claimants
```

### SSE Event Types: Vendor Stream

```
EVENT: claim:new
Payload: { claimId, userName, claimedAt, itemsRemaining, reliabilityScore }

EVENT: claim:expired
Payload: { claimId, itemsReleased }

EVENT: claim:cancelled
Payload: { claimId, itemsReleased }
```

### Web Push Payload (FCM / Service Worker)

```json
{
  "title": "GOING NOW: OvenFresh Bakery",
  "body": "Pastry Bundle Rs.120 4 min left 1.2km away",
  "icon": "/icons/icon-192.png",
  "badge": "/icons/badge-72.png",
  "data": { "dealId": "uuid", "url": "/deals/uuid" },
  "actions": [
    { "action": "claim", "title": "Claim Now" },
    { "action": "dismiss", "title": "Dismiss" }
  ]
}
```

---

## 9. Geospatial Engine

### CRIT-1 + PROD-1 + ARCH-5 FIX: Core Geofence Query

```sql
-- CRIT-1 FIX: CROSS JOIN replaced with indexed JOIN.
--   Before: FROM users u CROSS JOIN deals d
--   This created a full Cartesian product (rows = users x deals) before filtering.
--   After:  FROM deals d JOIN users u ON ST_DWithin(...)
--   The GIST index on users.current_location is hit as the JOIN predicate directly.
--
-- PROD-1 FIX: 7-day vendor exclusion filter removed.
--   It punished loyal rescuers and killed retention.
--   Dutch Auction pricing alone handles cannibalization prevention.
--
-- ARCH-5 FIX: Stale-location users excluded via JOIN predicate.
--   They receive no notification at all.

SELECT
  u.id,
  u.fcm_token,
  u.push_subscription,
  u.notifications_enabled,
  ST_Distance(u.current_location, d.deal_location) AS distance_meters
FROM deals d
JOIN users u
  ON ST_DWithin(u.current_location, d.deal_location, d.effective_radius_meters)
  AND u.location_consent = true
  AND u.notifications_enabled = true
  AND u.is_flagged = false
  AND u.location_updated_at > NOW() - INTERVAL '15 minutes'
WHERE d.id = $1
ORDER BY distance_meters ASC;
```

### Dynamic Radius Engine Algorithm

```
BASE RADIUS = 2000 meters

STEP 1 - Density Adjustment:
  metro  (pop density > 10k/km2): base * 0.6 = 1200m
  tier2:                          base * 1.0 = 2000m
  tier3 / suburban:               base * 1.8 = 3600m

STEP 2 - Urgency Adjustment:
  > 45 min until close: radius * 0.8
  20-45 min:            radius * 1.0
  < 20 min:             radius * 1.4

STEP 3 - Quantity Adjustment:
  1-2 items: radius * 0.7
  3-5 items: radius * 1.0
  6+ items:  radius * 1.3

STEP 4 - Claim Rate Adjustment:
  avg_claim_rate > 80%: radius * 0.9
  avg_claim_rate < 40%: radius * 1.2

HARD LIMITS: min 500m | max 5000m
FINAL = clamp(base * density * urgency * qty * claimRate, 500, 5000)
```

### ARCH-8 FIX: Vendor Location Validation (Nominatim)

```
On vendor registration:
1. Vendor types business address as text.
2. Backend calls Nominatim (OpenStreetMap): free, no API key required.
   GET https://nominatim.openstreetmap.org/search?q={address}&format=json
   Rate limit: 1 req/sec - acceptable for low-frequency vendor onboarding.
   Required header: User-Agent: egpp-food-rescue/1.0 (admin@egpp.app)
3. Returns lat/lng + display_name.
4. Vendor confirms on Leaflet.js map pin.
5. Coordinates saved as verified_location (IMMUTABLE post-approval).
6. Vendor app cannot self-report dynamic GPS coordinates.
7. IP-city vs registered-city mismatch triggers admin review flag.
8. Admin approves vendor before first deal can be posted.

Production note: For high-volume onboarding, deploy a self-hosted
Nominatim instance via Docker to eliminate rate limit risk.
```

---

## 10. Urgency Score Engine (RUS)

```
FACTOR 1: Time Pressure (weight 35%)
  minutes_remaining = (expires_at - NOW()) / 60
  score = max(0, (60 - minutes_remaining) / 60) * 10
  [0 min left = 10.0 | 60+ min left = 0.0]

FACTOR 2: Scarcity (weight 30%)
  items_remaining = total_quantity - claimed_quantity
  score = max(0, (5 - items_remaining) / 5) * 10
  [1 item left = 8.0 | 5+ items = 0.0]

FACTOR 3: Historical Claim Speed (weight 20%)
  avg_claim_lag = vendor's average seconds to first claim
  score = max(0, 10 - (avg_claim_lag / 120))

FACTOR 4: User Distance (weight 10%, personalized)
  score = max(0, (2 - distance_km) / 2) * 10

FACTOR 5: Weather Mobility Factor (weight 5%)
  PROD-2 FIX: Semantics explicitly defined.
  This factor measures USER MOBILITY LIKELIHOOD, not deal scarcity.
  Bad weather = users are less mobile = lower urgency to travel = lower RUS.
  Applied as a multiplier on the weighted sum.

  Heavy rain / extreme heat: weather_modifier = 0.85
  Clear / mild:              weather_modifier = 1.00

RUS_raw = (F1*0.35) + (F2*0.30) + (F3*0.20) + (F4*0.10) + (F5*0.05)
RUS     = RUS_raw * weather_modifier

LABEL MAPPING:
  RUS >= 8.0 --> GOING_NOW   (red, pulsing animation)
  RUS >= 5.0 --> ACT_SOON    (orange)
  RUS <  5.0 --> COMFORTABLE (yellow)
```

RUS recalculated every 5 minutes by Worker 3 and immediately on any claimed_quantity change.

---

## 11. AI and Machine Learning Layer

### 11.1 Dynamic Price Suggester (ARCH-2)

**Problem:** Vendors guess pricing: too high = expires; too low = revenue loss.

**Solution:** Predictive Pricing Model trained on vendor_analytics.
Inputs: time_until_close, item_category, original_price, weather_factor, city_density, day_of_week
Output: Predicted claim_lag_secs -> suggested Start Price, Min Reserve Price, Degradation Curve

**Model Pre-warming (eliminates cold-start latency):**
```python
@app.on_event("startup")
def load_model():
    app.state.model = joblib.load("models/price_predictor.pkl")
```

**Graceful Fallback (no blank price fields):**
```javascript
const suggestion = await Promise.race([
  aiService.getPriceSuggestion(params),
  new Promise((_, reject) => setTimeout(() => reject('timeout'), AI_TIMEOUT_MS))
]).catch(() => defaultPricingRules(params));
```

**Default Fallback Table:**
| Time Until Close | Suggested Start Price |
|---|---|
| > 60 min | 60% of original_price |
| 30-60 min | 50% of original_price |
| 15-30 min | 40% of original_price |
| < 15 min | min_rescue_price |

**Training Data Strategy:**
- v1: synthetic data (data_gen.py); model labeled "demo mode" in UI.
- Post-launch: real vendor_analytics data collected.
- After 500+ real records: train.py --real retrains on actual data monthly.

---

### 11.2 Snap-to-Post Vision AI Pipeline (Hugging Face ViT)

**Problem:** Vendors in the rush of closing time find manual inventory typing, tag selection, and pricing tedious, leading to low listing adoption.

**Solution:** **Snap-to-Post Vision AI** uses a pre-trained Vision Transformer (ViT) hosted on Hugging Face (`rajistics/finetuned-indian-food` / `nateraw/food-101`) to automatically identify food items from a single camera snapshot, map dietary tags, and immediately trigger the Dynamic Price Suggester.

#### Architecture Flow

```
[ Vendor Camera (PWA) ] 
       │  Capture photo
       ▼
[ POST /api/ai/snap-to-post (Express Multer) ]
       │  Uploads binary to Cloudinary CDN
       ▼
[ Cloudinary CDN ] ──> Returns secure CDN URL
       │
       ▼
[ Python FastAPI AI Service: /recognize-and-price ]
       │
       ├── 1. Hugging Face ViT Inference Engine:
       │      Sends image tensor/URL to ViT model (`rajistics/finetuned-indian-food`)
       │      Returns Top-3 candidate labels with confidence scores (e.g. Samosa: 0.94)
       │
       ├── 2. Food Taxonomy & Dietary Tag Lookup:
       │      Maps predicted label -> standard category, dietary tags ('veg', 'dairy'),
       │      and benchmark retail price (INR)
       │
       └── 3. Auto-Trigger Dynamic Price Suggester (ARCH-2):
              Feeds classified category + benchmark price + minutes_to_close into ML model
              Computes: Start Price, Min Rescue Price, Dutch Auction drop intervals
       │
       ▼
[ Form Auto-Fill Response JSON ]
       │
       ▼
[ Vendor PWA PostDeal Form: Auto-Populated & Ready for 1-Click Verification ]
```

#### Hugging Face ViT Model Specification

- **Primary Model:** `rajistics/finetuned-indian-food` (Google ViT-Base fine-tuned on Indian dish dataset with 93%+ accuracy across common items: samosas, idli, biryani, dosa, paneer, naan, pav bhaji, sweets).
- **Secondary / General Model:** `nateraw/food-101` (ViT fine-tuned on Food-101 for bakery items, pizza, burgers, pastries).
- **Inference Mode:**
  - *Option A (Development/Serverless):* Hugging Face Inference API via `HUGGINGFACE_API_TOKEN`
  - *Option B (Self-Hosted Production):* Local pipeline using `transformers.pipeline("image-classification", model=...)` preloaded during FastAPI startup.

#### Taxonomy & Dietary Tag Mapping Rules

```python
# taxonomy_mapping.py (in ai_service)
FOOD_TAXONOMY = {
    "samosa": {
        "display_name": "Samosa",
        "category": "snacks",
        "dietary_tags": ["veg"],
        "default_unit": "pieces",
        "benchmark_price": 20.0
    },
    "paneer_butter_masala": {
        "display_name": "Paneer Butter Masala",
        "category": "curry",
        "dietary_tags": ["veg", "contains_dairy"],
        "default_unit": "portion",
        "benchmark_price": 180.0
    },
    "biryani": {
        "display_name": "Biryani",
        "category": "rice_meals",
        "dietary_tags": ["non_veg"],
        "default_unit": "portion",
        "benchmark_price": 220.0
    },
    "croissant": {
        "display_name": "Butter Croissant",
        "category": "bakery",
        "dietary_tags": ["veg", "contains_gluten", "contains_dairy"],
        "default_unit": "pieces",
        "benchmark_price": 90.0
    }
}
```

#### Sample Response Contract (`POST /api/ai/snap-to-post`)

```json
{
  "status": "success",
  "image_url": "https://res.cloudinary.com/egpp/image/upload/v1234/food_snap.jpg",
  "recognized": {
    "primary_item": "Samosa",
    "confidence": 0.94,
    "category": "snacks",
    "dietary_tags": ["veg"],
    "items": [
      { "name": "Samosa", "quantity": 4, "unit": "pieces" }
    ]
  },
  "pricing": {
    "original_price": 80.0,
    "suggested_start_price": 48.0,
    "suggested_min_price": 25.0,
    "pricing_source": "AI_PREDICTED",
    "degradation_interval_mins": 10
  }
}
```

#### Resilience & Graceful Fallback Strategy

1. **Low Confidence Filter:** If model confidence `< 0.50`, the system populates the image URL into the form but prompts the vendor with an `AI Badge: Review Item Name` badge to manually confirm dish selection.
2. **Timeout Circuit Breaker:** If Hugging Face API / local inference exceeds `2000ms`, the backend falls back to standard image-only attachment with default pricing rules without crashing or blocking the vendor flow.
3. **Vendor Override Guarantee:** All AI-inferred values (title, item counts, tags, prices) are editable in the UI before posting to maintain 100% vendor agency.

---

## 12. Background Worker System

All workers run via BullMQ with Redis. All use 3x retry with exponential backoff.

### Worker 1: TTL Expiry Sweep
```
Queue:   deal-expiry
Trigger: Delayed job queued at deal-post time, fires at expires_at
Steps:
  1. Confirm deal is still ACTIVE or PARTIALLY_CLAIMED
  2. UPDATE deals SET status = 'EXPIRED'
  3. Fire SSE: deal:expired
  4. Send FCM to users who had deal open
  5. Write to vendor_analytics with deal snapshot fields
  6. Update vendor avg_claim_rate stat
```

### Worker 2: Claim Timeout + Auto-Release
```
Queue:   claim-timeout
Trigger: Delayed job on claim CONFIRMED
         delay = LEAST(confirmedAt + 20 min, expires_at - 5 min)
Steps:
  1. Check claim is still CONFIRMED
  2. SET claim.status = EXPIRED, expired_at = NOW()
  3. BEGIN TRANSACTION:
       UPDATE deals SET claimed_quantity = claimed_quantity - 1
       UPDATE deals SET status appropriately
     COMMIT;
  4. Fire SSE: deal:released
  5. Re-run geospatial query; push deal:new to eligible users
  6. Increment no_show_count, total_claims
  7. reliability_score = successful_pickups / GREATEST(total_claims, 1)
  8. If no_show_count > 3: is_flagged = true
```

### Worker 3: RUS Recalculator
```
Queue:   rus-update
Trigger: Repeating every 5 minutes while ACTIVE deals exist
Steps:
  1. Fetch all ACTIVE and PARTIALLY_CLAIMED deals
  2. Load weather data from Redis cache
  3. Compute F1-F5 per deal; apply weather_modifier; map to label
  4. UPDATE deals SET urgency_score, urgency_label, rus_updated_at
  5. notifyUser() for each relevant user
```

### Worker 4: Pickup Reminder
```
Queue:   pickup-reminder
Trigger: confirmedAt + 10 minutes per claim
Steps:
  1. Confirm claim is still CONFIRMED
  2. notifyUser(): "Your deal expires in 10 minutes!"
  3. reminder_sent = true
```

### Worker 5: Weather Cache Refresher
```
Queue:   weather-refresh
Trigger: Every 30 minutes
Steps:
  1. Get unique cities from active deals
  2. Call OpenWeatherMap API for each city
  3. Redis: SET weather:{city} EX 2100
```

### Worker 6: Dutch Auction Price Dropper
```
Queue:   price-drop
Trigger: Scheduled at next_price_drop_at per deal
Steps:
  1. Check deal is ACTIVE or PARTIALLY_CLAIMED
  2. Compute new current_price via linear degradation (floor = min_rescue_price)
  3. UPDATE deals SET current_price, next_price_drop_at
  4. notifyUser(): deal:price_drop event
  5. Schedule next price-drop job if above floor
```

### Worker 7: NGO Handoff Cascade
```
Queue:   ngo-cascade
Trigger: expires_at - 15 minutes per deal

Steps:
  1. GUARD (CRIT-3 + ARCH-3 FIX):
     Exit early if deal.status != 'ACTIVE' OR claimed_quantity > 0.
     Proceed ONLY when ACTIVE AND claimed_quantity == 0.
  2. UPDATE deals SET status = 'NGO_HANDOFF'
  3. Fire SSE: deal:ngo_handoff
  4. Dispatch webhook to NGOs on admin DPA allowlist ONLY (COMP-2 FIX)
     Payload: vendorName, vendorAddress, itemCount, dietaryTags, expiresAt
  5. Web Push to Vendor: unsold items offered to NGO
```

---

## 13. Critical Implementation Notes

### CRIT-2 FIX: Claim Flow ACID Transaction

```sql
BEGIN;

WITH claim_lock AS (
  UPDATE deals
  SET
    claimed_quantity = claimed_quantity + 1,
    status = CASE
      WHEN (claimed_quantity + 1) >= total_quantity THEN 'CLAIMED'
      ELSE 'PARTIALLY_CLAIMED'
    END
  WHERE id = $dealId
    AND status IN ('ACTIVE', 'PARTIALLY_CLAIMED')
    AND claimed_quantity < total_quantity
  RETURNING id, claimed_quantity, total_quantity, expires_at
)
INSERT INTO claims (deal_id, user_id, qr_token, qr_expires_at, confirmed_at)
SELECT
  $dealId, $userId, gen_random_uuid()::text,
  LEAST(NOW() + INTERVAL '20 minutes', cl.expires_at - INTERVAL '5 minutes'),
  NOW()
FROM claim_lock cl
RETURNING *;
-- 0 rows = deal full or expired -> ROLLBACK -> "already gone" response

COMMIT;
```

### ARCH-7 FIX: JWT Refresh Token Redis Blocklist

```
On Login:       Redis SET refresh:{jti} {userId} EX 604800
On Refresh:     Redis EXISTS refresh:{jti} -> reject if 0
On Logout:      Redis DEL refresh:{jti}
Optional:       Redis SET blocklist:{accessJti} 1 EX 900 (immediate full revocation)
On SSE connect: auth.js checks blocklist:{accessJti}; reject 401 if exists
```

### ARCH-6 FIX: Reliability Score Formula

```
reliability_score = successful_pickups / GREATEST(total_claims, 1)

Range: 0.00 to 1.00 | Default: 1.00

Updates:
  PICKED_UP  -> successful_pickups++, total_claims++, recalculate
  EXPIRED    -> no_show_count++, total_claims++, recalculate
  CANCELLED  -> total_claims++ only (no penalty)

Flagging: no_show_count > 3 -> is_flagged = true -> 7-day suspension
```

---

## 14. Flaw Corrections Applied

Fix 1: Dynamic Radius - RadiusEngine considers density, urgency, quantity, claim rate. Min 500m, max 5km.

Fix 2: SSE / FCM Deduplication - Mutually exclusive channels via Redis sse:user:{id} presence key.

Fix 3: Vendor Location Validation - Nominatim geocoding + Leaflet map confirmation. verified_location immutable after approval.

Fix 4: Location Freshness TTL - Stale-location users excluded from all push via JOIN predicate.

Fix 5: ACID-Safe Claim Transaction - Single BEGIN/COMMIT wraps inventory decrement + claim INSERT.

Fix 6: Claim Timeout + Auto-Release - BullMQ delayed job; transactional slot release; reliability score updated.

Fix 7: DPDP / GDPR Compliance - Consent screen; Go Offline closes SSE + clears location; full erasure endpoint.

Fix 8: Anti-Cannibalization - 7-day vendor exclusion removed. Dutch Auction alone handles cannibalization.

Fix 9: NGO Handoff Guard - Worker 7 exits early if claimed_quantity > 0. Only completely unsold deals.

Fix 10: QR Expiry Consistency - qr_expires_at = LEAST(NOW()+20min, expires_at-5min). Recomputed if deal shortened.

Fix 11: Claim Cancellation Flow - POST /api/deals/:id/claim/cancel. CONFIRMED to CANCELLED, atomic slot release, no penalty.

Fix 12: SSE Connection Health - 15s heartbeat; req.on('close') cleanup; res.setTimeout(0); Nginx proxy_buffering off.

Fix 13: JWT Logout Invalidation - Redis blocklist keyed by jti. Logout DELetes key.

---

## 15. Feature List

### P0: Core MVP
- User registration + login; age gate via DOB server-side validation [COMP-1]
- Vendor onboarding with Nominatim free geocoding [ARCH-8]
- Deal posting with transparent exact inventory
- Dynamic radius computation via RadiusEngine
- PostGIS indexed JOIN spatial query with freshness filter [CRIT-1]
- SSE consumer stream (all events including deal:items_updated)
- SSE / FCM mutual exclusion [ARCH-4]
- Stale-location users excluded from all push [ARCH-5]
- ACID-safe claim transaction [CRIT-2]
- Claim cancellation endpoint [CRIT-4]
- QR expiry recomputed if deal shortened [PROD-3]
- BullMQ TTL expiry sweep worker
- BullMQ claim timeout worker (transactional)
- BullMQ Dutch Auction price dropper worker [COMP-6]
- BullMQ NGO Handoff worker with guard [COMP-6, CRIT-3]
- JWT refresh token blocklist in Redis [ARCH-7]
- DPDP consent screen; Go Offline closes SSE + clears location [PROD-6]
- Rate limiting on all critical endpoints [COMP-3]
- SSE heartbeat + req.on('close') cleanup [CRIT-5]
- Deal PATCH mutation rules enforced server-side [PROD-4]

### P1: Enhanced (Sprint 2)
- Python FastAPI AI Microservice: pre-warmed model + fallback defaults [ARCH-2]
- Snap-to-Post Vision AI: Hugging Face ViT food image classification (`rajistics/finetuned-indian-food`)
- Auto-tagging dietary preferences & auto-triggering Dynamic Price Suggester from food images
- ML-based Dynamic Price Suggester
- RUS engine with defined weather mobility semantics [PROD-2]
- RUS labels on deal cards
- BullMQ RUS recalculator worker
- User reliability score with defined formula [ARCH-6]
- Flagged user suspension (3+ no-shows = 7-day ban)
- Pickup reminder push notification
- Vendor live dashboard with SSE claim/cancel feed
- Vendor analytics with composite index [COMP-5]
- Vendor subscription billing [PROD-5]

### P2: Growth (Sprint 3)
- Vendor Surplus Intelligence Dashboard
- Admin panel + NGO DPA allowlist management [COMP-2]
- Multi-item batch photo classification
- Dietary tag preference user alerts & filters

### P3: Polish (Sprint 4)
- Reputation badges; deal sharing; Leaflet map view
- Carbon impact tracker; multi-language support
- In-app payments via Razorpay [PROD-5]

---

## 16. Frontend Pages and Components

### Consumer App
| Page | Route | Description |
|---|---|---|
| Consent Screen | /consent | DPDP consent before location access |
| Register / Login | /auth | Email/phone + password + DOB (age gate) |
| Home Feed | / | Live SSE deal cards sorted by RUS |
| Deal Detail | /deals/:id | Full info, countdown, RUS meter, Claim + Cancel button |
| My Claims | /claims | Active, past, expired, cancelled claims + QR codes |
| Profile + Settings | /profile | Notification prefs; Go Offline (closes SSE + clears location) |
| Privacy + Data | /privacy | Data policy, delete account |

### Vendor App
| Page | Route | Description |
|---|---|---|
| Onboarding | /vendor/onboard | Business registration + Nominatim/Leaflet geocoding |
| Post Deal | /vendor/post | Inventory form + Snap-to-Post AI image recognition + dynamic price suggestion |
| Live Dashboard | /vendor/dashboard | Active deals; SSE claim/cancel/items-updated feed |
| QR Scanner | /vendor/scan | Camera QR scan, confirm pickup |
| Analytics | /vendor/analytics | Rescue stats, revenue, time heatmap |
| Settings | /vendor/settings | Business profile, hours, logo, subscription tier |

### Key Components
| Component | Description |
|---|---|
| FoodImageCapture | Native camera snap / gallery upload with AI auto-fill triggers |
| DealCard | Compact card with RUS badge, countdown, distance |
| RUSMeter | Visual urgency arc (green to red, pulsing on GOING_NOW) |
| CountdownTimer | Server-synchronized countdown |
| InventoryList | Exact items with quantities |
| QRCodeDisplay | Full-screen QR for pickup |
| SSEProvider | React context wrapping EventSource with heartbeat |
| PushPermission | Web Push opt-in prompt |
| MapView | Leaflet map with deal pins and radius circle |
| ReliabilityBadge | User reliability score display |
| ConsentModal | DPDP compliance consent flow |
| CancelClaimButton | Cancels CONFIRMED claim; disabled after PICKED_UP or EXPIRED |
| AIPriceBadge | Shows AI Suggested, Vision Detected, or Default fallback labels |

---

## 17. Compliance and Privacy (DPDP + GDPR)

| Requirement | Implementation |
|---|---|
| Informed Consent | Consent screen before location access; plain-language explanation |
| Purpose Limitation | Location used ONLY for deal matching; never shared with vendors |
| Data Minimization | Only current_location + location_updated_at stored; zero history |
| Right to Erasure | DELETE /api/users/me/data wipes all personal data |
| Right to Withdraw | Go Offline: disables tracking + closes SSE stream instantly |
| Data Retention [ARCH-1] | Deal metadata: 24h post-expiry; Claims: 30 days; Vendor analytics: indefinite (anonymized) |
| Vendor DPA | Terms of service include Data Processing Agreement |
| Security | Locations over HTTPS; 15-min access tokens; Redis refresh token blocklist |
| Age Gate [COMP-1] | DOB required. Server rejects if date_of_birth > NOW() - INTERVAL '13 years'. No bypass. |
| NGO Partner DPA [COMP-2] | Webhook ONLY to NGOs on admin DPA allowlist. Payload: vendor info only; no user data. |
| Third-Party Processors | Cloudinary and NGO partners; both covered by DPA clauses in ToS |

---

## 18. Folder Structure

```
egpp-food-rescue/
├── ai_service/
│   ├── main.py                 # FastAPI; model pre-warmed on startup [ARCH-2]
│   ├── vision_pipeline.py      # Hugging Face ViT food image classification pipeline
│   ├── taxonomy_mapping.py     # Indian food dish taxonomy, dietary tags & benchmark prices
│   ├── models/
│   │   └── price_predictor.pkl
│   ├── training/
│   │   ├── train.py            # --synthetic for demo; --real for production
│   │   └── data_gen.py
│   ├── requirements.txt        # fastapi, uvicorn, transformers, torch, pillow, httpx, scikit-learn
│   └── Dockerfile
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   ├── redis.js
│   │   │   └── firebase.js
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── dealController.js
│   │   │   ├── claimController.js      # Includes /cancel endpoint [CRIT-4]
│   │   │   ├── aiController.js         # Snap-to-Post vision + pricing orchestration
│   │   │   ├── vendorController.js
│   │   │   ├── userController.js
│   │   │   ├── analyticsController.js
│   │   │   ├── adminController.js      # NGO partner allowlist [COMP-2]
│   │   │   └── privacyController.js
│   │   ├── services/
│   │   │   ├── radiusEngine.js
│   │   │   ├── rusCalculator.js        # Corrected weather semantics [PROD-2]
│   │   │   ├── pushService.js          # SSE+FCM with deduplication [ARCH-4]
│   │   │   ├── geocodingService.js     # Nominatim free geocoding [ARCH-8]
│   │   │   ├── weatherService.js
│   │   │   └── qrService.js
│   │   ├── workers/
│   │   │   ├── dealExpiryWorker.js
│   │   │   ├── claimTimeoutWorker.js   # Transactional slot release [CRIT-2]
│   │   │   ├── rusWorker.js
│   │   │   ├── reminderWorker.js
│   │   │   ├── weatherWorker.js
│   │   │   ├── priceDroppingWorker.js  # Worker 6 ADDED [COMP-6]
│   │   │   └── ngoHandoffWorker.js     # Worker 7 with guard ADDED [COMP-6 CRIT-3]
│   │   ├── queries/
│   │   │   ├── geospatialQueries.js    # Indexed JOIN no CROSS JOIN [CRIT-1]
│   │   │   ├── dealQueries.js
│   │   │   └── userQueries.js
│   │   ├── middleware/
│   │   │   ├── auth.js                 # JWT verify + blocklist check [ARCH-7]
│   │   │   ├── roleGuard.js
│   │   │   ├── validate.js
│   │   │   └── rateLimiter.js          # Per-route limits [COMP-3]
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── deal.routes.js
│   │   │   ├── claim.routes.js         # Includes /cancel route [CRIT-4]
│   │   │   ├── ai.routes.js            # Snap-to-Post & AI price routes
│   │   │   ├── vendor.routes.js
│   │   │   ├── user.routes.js
│   │   │   ├── sse.routes.js
│   │   │   └── admin.routes.js         # NGO partner management
│   │   ├── sse/
│   │   │   ├── SSEManager.js           # Heartbeat + req.on('close') [CRIT-5]
│   │   │   └── sseEvents.js
│   │   └── app.js
│   ├── migrations/
│   ├── seeds/
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── public/
│   │   ├── manifest.json
│   │   ├── service-worker.js
│   │   └── icons/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── ConsentScreen.jsx
│   │   │   ├── Auth.jsx                # DOB field age gate [COMP-1]
│   │   │   ├── HomeFeed.jsx
│   │   │   ├── DealDetail.jsx          # Cancel Claim button [CRIT-4]
│   │   │   ├── MyClaims.jsx            # CANCELLED state shown
│   │   │   ├── Profile.jsx             # Go Offline closes SSE [PROD-6]
│   │   │   ├── PrivacyPage.jsx
│   │   │   └── vendor/
│   │   │       ├── VendorOnboard.jsx   # Nominatim [ARCH-8]
│   │   │       ├── PostDeal.jsx        # Snap-to-Post camera + AI price suggestion [ARCH-2]
│   │   │       ├── VendorDashboard.jsx
│   │   │       ├── QRScanner.jsx
│   │   │       └── Analytics.jsx
│   │   ├── components/
│   │   │   ├── FoodImageCapture.jsx    # Native camera snap & gallery auto-fill trigger
│   │   │   ├── DealCard.jsx
│   │   │   ├── RUSMeter.jsx
│   │   │   ├── CountdownTimer.jsx
│   │   │   ├── InventoryList.jsx
│   │   │   ├── QRCodeDisplay.jsx
│   │   │   ├── MapView.jsx
│   │   │   ├── ReliabilityBadge.jsx
│   │   │   ├── ConsentModal.jsx
│   │   │   ├── CancelClaimButton.jsx   # New [CRIT-4]
│   │   │   ├── AIPriceBadge.jsx        # New [ARCH-2]
│   │   │   └── PushPermission.jsx
│   │   ├── context/
│   │   │   ├── SSEContext.jsx
│   │   │   ├── AuthContext.jsx
│   │   │   └── DealContext.jsx
│   │   ├── hooks/
│   │   │   ├── useSSE.js
│   │   │   ├── useLocation.js          # 10-min location heartbeat
│   │   │   ├── usePushNotifications.js
│   │   │   └── useCountdown.js
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   ├── pushRegistration.js
│   │   │   └── locationService.js
│   │   ├── styles/
│   │   │   ├── index.css
│   │   │   ├── components.css
│   │   │   └── pages.css
│   │   └── main.jsx
│   ├── .env.example
│   └── package.json
│
├── docker-compose.yml
├── nginx.conf     # proxy_read_timeout 65s + proxy_buffering off for SSE [CRIT-5]
└── README.md
```

---

## 19. Environment Variables

### Backend .env.example
```
DATABASE_URL=postgresql://user:pass@localhost:5432/egpp_db
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=your_access_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email

# ARCH-8 FIX: Nominatim (OpenStreetMap) geocoding - FREE, no API key required
# For production scale: deploy self-hosted Nominatim via Docker
# MAPBOX_ACCESS_TOKEN is NOT used
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
NOMINATIM_USER_AGENT=egpp-food-rescue/1.0 (admin@egpp.app)

OPENWEATHER_API_KEY=your_api_key

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_EMAIL=mailto:admin@egpp.app

PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# PROD-5 FIX: v1 revenue = vendor subscriptions; PLATFORM_FEE_PERCENT inactive in v1
PLATFORM_FEE_PERCENT=10
SUBSCRIPTION_STARTER_PRICE=0
SUBSCRIPTION_RESCUE_PRICE=499
SUBSCRIPTION_CHAIN_PRICE=1999

AI_SERVICE_URL=http://localhost:8000
# ARCH-2 FIX: Timeout before falling back to default pricing rules
AI_SERVICE_TIMEOUT_MS=2000

# Hugging Face Vision AI Configuration
HUGGINGFACE_API_TOKEN=your_hf_token_here
HF_FOOD_MODEL=rajistics/finetuned-indian-food
```
```

### Frontend .env.example
```
VITE_API_URL=http://localhost:4000
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key
# No MAPBOX_TOKEN required. Geocoding: server-side Nominatim. Maps: Leaflet + OSM (free).
```

---

## 20. Future Roadmap

| Phase | Feature | Rationale |
|---|---|---|
| v2.0 | Razorpay in-app payments | Transition from subscription to per-transaction revenue |
| v2.0 | ML model retraining pipeline | Monthly retrain on real vendor_analytics data |
| v2.0 | Group claim (share with friends) | Social dimension, increases claim rate |
| v3.0 | Vendor POS integration | Auto-post from billing when items dip below threshold |
| v3.0 | Carbon credit API | Convert rescued food weight to verified carbon offsets |
| v3.0 | City open data export | Anonymized surplus heatmaps for municipal planning |
| Research | Publish RUS behavioral dataset | Partner with university to study urgency-response behavior |
| Infra | Self-hosted Nominatim instance | Eliminate rate limit risk at vendor onboarding scale |

---

## Summary: What Makes This Unique

No existing platform combines all of the following:

1. Event-driven push (not pull REST) for food rescue
2. Exact transparent inventory - proven by research to cut household waste transfer
3. Dynamic geospatial radius - adapts to city density and deal urgency
4. Real-Time Urgency Score (RUS) - novel 5-factor composite with explicitly defined semantics
5. Server-enforced TTL - deal data removed from active queries at store close; retained in defined audit windows
6. Vendor surplus intelligence - generates the granular data researchers say is missing
7. India-first, informal sector focus - an entirely unstudied deployment context globally
8. ACID-safe claim concurrency - single-transaction claim prevents inventory corruption under load
9. JWT with server-side invalidation - correct auth pattern using Redis refresh token blocklist
10. SSE/FCM deduplication - no double-notification spam; mutually exclusive channels

---

Blueprint Version: 1.2 (Snap-to-Post Vision AI Enhanced: Hugging Face ViT Food Recognition)
Last Updated: 2026-09-10
Status: Pre-Development Specification Ready
Audit Reference: blueprint_audit.md
Previous Version: v1.1 (2026-09-05)
