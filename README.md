# Gigs4You Monorepo

This repository contains the Gigs4You platform, including the React dashboard, NestJS API services, Flutter mobile apps, and supporting infrastructure.

## 🎯 Active Projects (Consolidated - April 5, 2026)

### Backend Services
- **`gigs4you-api/`** ✅ — NestJS backend API (primary) - Fixed and tested
- **`gigs4you-ai-service/`** ✅ — AI/ML service components (FastAPI) - Production-ready

### Frontend Applications
- **`gigs4you-dashboard/`** ✅ — Complete React dashboard (users, workers, admins, managers)
  - Modern React 19, TanStack Query v5, all features from both dashboards merged
  - Jobs, tasks, analytics, payments, PDF exports, admin panel, real-time updates
- **`gigs4you-mobile-v2/`** ✅ — Updated Flutter mobile app - Latest version
- **`gigs4you-website/`** ✅ — Public website with API integration

## ⚠️ Legacy Projects (Archived/Deleted)

- `api/` — **ARCHIVED**: Basic NestJS setup - merged into `gigs4you-api/`
- `admin-dashboard/` — **ARCHIVED**: Admin panel - merged into `gigs4you-dashboard/`
- `ai-service/` — **RENAMED**: AI service - now `gigs4you-ai-service/`
- `gigs4you-mobile/` — **LEGACY**: Original mobile app - use `gigs4you-mobile-v2/`

## Quick Start

### Start all services
```bash
# Infrastructure first
docker compose up -d postgres redis minio

# AI service
docker compose up -d gigs4you-ai-service

# API backend
cd gigs4you-api && npm run start:dev

# Dashboard frontend
cd gigs4you-dashboard && npm run dev
```

### Individual service URLs
- **Dashboard**: `http://localhost:5173` (complete user/admin interface)
- **API Backend**: `http://localhost:3000`
- **AI Service**: `http://localhost:8001`
- **PostgreSQL**: `localhost:5432`
- **Redis**: `localhost:6379`
- **MinIO**: `http://localhost:9001` (console)
- **MinIO**: `http://localhost:9001` (console)

💡 **See `DASHBOARD_COMPARISON.md` for detailed feature comparison**

## Production Readiness

A full production-readiness dependency audit has been added to:

- `PRODUCTION_READINESS_AUDIT.md` — Critical dependencies, missing features, and safe launch order

## Recent Fixes (April 5, 2026)

- ✅ Fixed admin-dashboard App.tsx parse error (removed dangling template code)
- ✅ Fixed gigs4you-api MatchingModule dependency injection (added AiModule import)
- ✅ Fixed gigs4you-mobile-v2 AndroidManifest placeholder error
- ✅ Resolved AI service dependency conflicts (langchain/crewai compatibility)

See `FIXES_APPLIED_2026_04_05.md` for detailed information.
