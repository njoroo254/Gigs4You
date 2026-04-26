# Gigs4You — Admin Dashboard

React + TypeScript + Vite dashboard for managers and supervisors.

## Setup

```powershell
cd gigs4you-dashboard
npm install
npm run dev
```

Open http://localhost:3001

## Login
Use the same credentials you registered via the NestJS API Swagger docs.
The account must have role: manager or admin.

## What's inside

| Page       | URL            | Features |
|------------|----------------|----------|
| Dashboard  | /dashboard     | Live agent map, stat cards, task charts, activity graph |
| Agents     | /agents        | Agent cards with XP, level, streak, GPS location |
| Tasks      | /tasks         | Full task table, filters, create task modal |
| Reports    | /reports       | Monthly charts, leaderboard, region heatbar |

## Connect to API
The dashboard proxies /api → http://localhost:3000 via vite.config.ts.
Make sure `npm run start:dev` is running in the gigs4you-api folder.

## Build for production
```powershell
# Set production environment variables
VITE_API_URL=https://your-api-domain.com/api/v1 VITE_SENTRY_DSN=https://your-sentry-dsn npm run build
# Output goes to dist/ folder
```

## Production Environment Variables
- `VITE_API_URL`: API base URL (default: http://localhost:3000/api/v1)
- `VITE_SENTRY_DSN`: Sentry DSN for error monitoring
