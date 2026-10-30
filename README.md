# LastCall — Ephemeral Geospatial Push Protocol (EGPP)
### Zero-Waste Food Rescue Platform

**LastCall** is a full-stack, real-time food rescue platform designed to connect vendors with nearby consumers and NGOs to eliminate food waste. Using real-time geospatial matching, dynamic pricing, and vision AI, vendors can snap a photo of surplus food and immediately notify nearby consumers.

---

## 🌟 Key Features

- **Snap-to-Post Vision AI**: Upload a food picture to automatically classify dishes, estimate shelf life, predict quantity, and recommend starting discount tiers (powered by Hugging Face ViT & FastAPI).
- **Dynamic Pricing Engine**: Algorithmic decay model combining Real-time Urgency Score (RUS), time-to-close, localized weather events, and remaining inventory.
- **Geospatial Proximity Matching**: PostGIS-based radial push notifications and real-time Server-Sent Events (SSE) broadcasting deals within customizable radius boundaries.
- **Fair Claim & Verification**: Concurrency-safe deal claiming with Redis TTL locks and dual-sided QR code verification between vendors and customers.
- **NGO Handoff Protocol**: Automated handoff triggers for unsold food reaching final expiration thresholds to local NGO partners.

---

## 🏗️ Architecture & Tech Stack

```
                          ┌──────────────────────┐
                          │   Frontend (React)   │
                          │   Vite + Tailwind    │
                          └──────────┬───────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │   Backend (Express)  │
                          │     Node.js REST     │
                          └────┬───────┬───────┬─┘
                               │       │       │
       ┌───────────────────────┘       │       └─────────────────────────┐
       ▼                               ▼                                 ▼
┌──────────────┐             ┌───────────────────┐             ┌────────────────────┐
│  PostgreSQL  │             │   Redis (Cache,   │             │   AI Microservice  │
│  + PostGIS   │             │  Locks & Workers) │             │  (FastAPI + ViT)   │
└──────────────┘             └───────────────────┘             └────────────────────┘
```

- **Frontend**: React, Vite, Tailwind CSS, Leaflet/MapLibre, QR Scanner/Generator
- **Backend**: Node.js, Express.js, Knex.js, Server-Sent Events (SSE)
- **Database**: PostgreSQL 16 with PostGIS extension
- **Cache & Concurrency**: Redis 7
- **AI Service**: Python FastAPI, PyTorch, Hugging Face Vision Transformers
- **Infrastructure**: Docker & Docker Compose

---

## 🚀 Getting Started

### Prerequisites

- [Docker & Docker Compose](https://www.docker.com/)
- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://www.python.org/) (3.10+)

### Environment Setup

1. Copy the example environment files:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

2. Fill in the required credentials and configurations in `.env`.

### Running with Docker Compose

To launch all services (PostgreSQL, Redis, AI Service, Backend):
```bash
docker-compose up --build
```

### Manual Development Setup

#### 1. Backend
```bash
cd backend
npm install
npx knex migrate:latest
npx knex seed:run
npm run dev
```

#### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

#### 3. AI Service
```bash
cd ai_service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## 📁 Repository Structure

```
├── ai_service/          # Python FastAPI microservice (ViT classifier & pricing engine)
├── backend/             # Express.js backend (REST API, PostGIS queries, workers)
├── docs/                # Project blueprints, architecture docs, implementation notes
├── frontend/            # React + Vite web client & PWA
├── docker-compose.yml   # Multi-container orchestration
└── README.md
```

---

## 📄 License

This project is licensed under the MIT License.
