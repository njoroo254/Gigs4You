# Rollback Runbook

Procedures for reverting a bad deployment or database migration without data loss.

---

## 1. Application Rollback (Docker Compose)

We use image tags to pin production to a known-good version.
Every build in CI should tag the image with the git SHA **and** `latest`.

### Roll back the API

```bash
# 1. Find the last known-good SHA (from git log or CI pipeline)
GOOD_SHA=abc1234

# 2. Pull the old image (if using a registry)
docker pull ghcr.io/your-org/gigs4you-api:${GOOD_SHA}

# 3. Override the image tag and restart
IMAGE_TAG=${GOOD_SHA} docker compose -f docker-compose.prod.yml up -d api
```

Or, if deploying directly from source:

```bash
git checkout ${GOOD_SHA}
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api
```

### Roll back the AI service

```bash
IMAGE_TAG=${GOOD_SHA} docker compose -f docker-compose.prod.yml up -d gigs4you-ai-service
```

### Verify after rollback

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Watch logs for errors
docker compose -f docker-compose.prod.yml logs -f --tail=100 api
```

---

## 2. Database Migration Rollback

All migrations must implement a reversible `down()` method.

### Roll back the last migration

```bash
cd gigs4you-api

# Show current migration state
npm run migration:show

# Revert the most recent migration
npm run migration:revert

# Verify the revert applied
npm run migration:show
```

### Roll back multiple migrations

```bash
# Revert N times (each call reverts one migration)
for i in {1..3}; do npm run migration:revert; done
```

### What to do when a migration has no `down()`

Some destructive migrations (e.g., column drops) cannot be reversed automatically.
In that case:

1. Restore from the most recent backup (see `docs/runbooks/backup-restore.md`).
2. Re-apply all migrations up to (but not including) the bad one:
   ```bash
   npm run migration:run
   ```
3. Mark the failed migration as "skipped" — do NOT add a manual entry to
   `migrations` table; instead fix the migration and redeploy.

---

## 3. Zero-Downtime Rollback Checklist

| Step | Command / Action | Expected outcome |
|------|-----------------|-----------------|
| 1. Confirm the issue | `docker compose logs api \| tail -200` | Identify failing commit |
| 2. Identify good SHA | `git log --oneline -20` | Pick last known-good tag |
| 3. Scale up old version | `IMAGE_TAG=<sha> docker compose up -d api` | New container starts |
| 4. Health check passes | `curl /api/v1/health` | `{"status":"ok"}` |
| 5. Revert migration (if any) | `npm run migration:revert` | State confirmed in `migration:show` |
| 6. Remove bad container | `docker compose rm -f api` (if old one still running) | |
| 7. Alert team | Post in #deployments Slack channel | |
| 8. Post-mortem | File issue within 24 h | |

---

## 4. Preventing Rollback Pain

- **Never drop columns in the same migration that removes code reading them.**
  Use the expand/contract pattern:
  1. Deploy code that writes to both old and new column
  2. Backfill
  3. Deploy code that reads only new column
  4. Drop old column in a later migration

- **Tag every production image** with the git SHA so `docker pull` can always
  fetch an older version.

- **Keep the last 5 production images** in the registry (don't prune aggressively).

- **Test `migration:revert`** in CI for every migration that adds `down()`.

---

## 5. Contacts

| Role | Who to call |
|------|------------|
| DB issue | Backend lead |
| M-Pesa issue | Payments lead + Safaricom Daraja support |
| Infrastructure | DevOps lead |
