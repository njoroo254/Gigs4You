# Gigs4You API

**The operating system for Africa's field workforce**

NestJS + PostgreSQL + TypeORM backend for the Gigs4You platform.

---

## Quick start (local dev)

### Prerequisites
- Node.js 20+
- Docker Desktop

### 1. Clone and install
```bash
git clone https://github.com/your-org/gigs4you-api
cd gigs4you-api
npm install
```

### 2. Start services
```bash
docker compose up -d postgres redis minio
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env — minimum required: DB_PASSWORD, JWT_SECRET
```

### 4. Run migrations
```bash
npm run migration:run
```

### 5. Seed initial data (run once)
```bash
# Start the API first
npm run start:dev

# Then in another terminal:
curl -X POST http://localhost:3000/api/v1/seed/fix-enum
curl -X POST http://localhost:3000/api/v1/seed/create-super-admin \
  -H "Content-Type: application/json" \
  -d '{"name":"Your Name","phone":"0712345678","password":"YourPass!","secret":"gigs4you-seed-2024"}'

# Seed 37 skills
curl http://localhost:3000/api/v1/skills/seed
```

### 6. Open Swagger UI
```
http://localhost:3000/docs
```

---

## Database migrations

```bash
# Generate a new migration after changing an entity
npm run migration:generate --name=AddFcmTokenToUser

# Apply all pending migrations
npm run migration:run

# Roll back last migration
npm run migration:revert

# Show migration status
npm run migration:show
```

**Never set `DB_SYNC=true` in production.** Use migrations instead.

---

## Production deployment

### With Docker Compose
```bash
cp .env.example .env
# Fill in all production values

docker compose up -d
docker compose exec api npm run migration:run
```

### Environment variables
See `.env.example` for a complete, annotated list.

**Critical variables you must set:**
- `DB_PASSWORD` — strong random password
- `JWT_SECRET` — at least 32 random characters
- `SEED_SECRET` — change the default before first deploy

**Optional but recommended:**
- `FCM_SERVICE_ACCOUNT_JSON` — push notifications
- `AT_API_KEY` — Africa's Talking SMS
- `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` — email
- `SENTRY_DSN` — error monitoring
- `MPESA_CONSUMER_KEY` + `MPESA_CONSUMER_SECRET` — M-Pesa payments

---

## Architecture

```
src/
├── auth/           JWT auth, registration, login, forgot/reset password
├── users/          User entity, CRUD, role/permission management
├── agents/         Field agents, GPS check-in/out, XP, levels
├── tasks/          Task lifecycle (create→assign→accept→complete)
├── jobs/           Job marketplace (post, apply, assign)
├── workers/        Freelancer profiles, CV, skill matching
├── billing/        Subscriptions (Free/Starter/Growth/Scale), invoices, M-Pesa STK
├── wallet/         Agent wallets, M-Pesa B2C payouts
├── chat/           Messaging (WebSocket + REST fallback)
├── gps/            Location pings, fraud detection, live map
├── reports/        Analytics, task/attendance/financial/agent reports
├── notifications/  In-app notifications
├── notifications-gateway/ SMS (Africa's Talking) + Email (nodemailer)
├── push/           FCM push notifications (firebase-admin)
├── upload/         S3-compatible file uploads (MinIO/AWS/R2)
├── verification/   KYC document submission and admin review
├── matching/       Rule-based job-to-agent AI matching
├── organisations/  Multi-tenant org management
├── skills/         Dynamic skill taxonomy
├── migrations/     TypeORM database migrations
└── common/         Guards, decorators, filters, i18n
```

---

## Role hierarchy

| Role | Access |
|---|---|
| `super_admin` | All data, all orgs, bypasses plan limits |
| `admin` | Own org — full access |
| `manager` | Own org — tasks, agents, jobs, reports |
| `supervisor` | Team tasks, agent oversight |
| `agent` | Own tasks, own GPS, own wallet |
| `employer` | Post jobs, view workers |
| `worker` | Browse jobs, manage CV |

---

## API endpoints overview

See `http://localhost:3000/docs` for the full interactive Swagger UI.

**Auth:** `POST /auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`  
**Agents:** `GET /agents`, `POST /agents/checkin`, `POST /agents/checkout`  
**Tasks:** `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id/accept`, `PATCH /tasks/:id/complete`  
**Jobs:** `GET /jobs`, `POST /jobs`, `POST /jobs/:id/apply`  
**Billing:** `GET /billing/subscription`, `POST /billing/subscribe`  
**Upload:** `POST /upload/avatar`, `POST /upload/task-photo`, `POST /upload/kyc-document`  
**Chat:** WebSocket at `ws://localhost:3000/chat`, REST fallback at `/chat/conversations`

---

## Running tests

```bash
npm test               # unit tests
npm run test:e2e       # end-to-end (requires running DB)
npm run test:cov       # coverage report
```

---

## Health check

```
GET /api/v1/health
```

Returns `{ status: "ok", db: "connected", uptime: 123 }`.
