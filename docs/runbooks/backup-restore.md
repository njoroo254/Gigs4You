# Backup & Restore Runbook

## Backup Strategy

| Destination | Retention | Schedule | Tool |
|-------------|-----------|----------|------|
| `E:\Gigs4You KE\backups\` (external drive) | 30 days | Every 12 h | Windows Task Scheduler |
| MinIO `gigs4you/backups/` | 90 days | Every 12 h | MinIO Client (`mc`) |

Backups are compressed `pg_dump` outputs (`*.sql.gz`) run inside the running
Postgres Docker container. The format is plain SQL so any Postgres 14+ instance
can restore them.

---

## First-Time Setup

### 1. Install MinIO Client

```powershell
winget install MinIO.MinioClient

# Configure the alias (run once)
mc alias set gigs4you http://localhost:9000 minioadmin minioadmin

# Verify
mc ls gigs4you/
```

### 2. Register the Task Scheduler job (run as Administrator)

```powershell
powershell -ExecutionPolicy Bypass -File `
  "C:\Users\PeterMuchene\Dev\Gigs4You\scripts\schedule-backup.ps1"
```

This creates a task named **"Gigs4You DB Backup"** that runs every 12 hours
under the SYSTEM account (works even when you're not logged in).

Logs are appended to `scripts\backup.log`.

### 3. Run a manual backup to test

```powershell
powershell -ExecutionPolicy Bypass -File `
  "C:\Users\PeterMuchene\Dev\Gigs4You\scripts\backup.ps1"
```

Expected output:
```
[2026-04-19 12:00:00] [INFO] Starting backup: gigs4you_2026-04-19_12-00.sql.gz
[2026-04-19 12:00:05] [INFO] Dump complete: 4.3 MB -> C:\Users\...\Temp\gigs4you_...sql.gz
[2026-04-19 12:00:05] [INFO] Copied to external drive: E:\Gigs4You KE\backups\...
[2026-04-19 12:00:08] [INFO] Uploaded to MinIO: gigs4you/gigs4you/backups/...
[2026-04-19 12:00:08] [INFO] Backup complete: gigs4you_2026-04-19_12-00.sql.gz
```

---

## Restore Procedure

### From external drive

```powershell
# 1. Pick the backup file to restore
$BACKUP = "E:\Gigs4You KE\backups\gigs4you_2026-04-19_00-00.sql.gz"

# 2. Copy it into the container and restore
docker cp $BACKUP gigs4you_postgres:/tmp/restore.sql.gz
docker exec gigs4you_postgres bash -c `
  "gunzip -c /tmp/restore.sql.gz | psql -U admin -d gigs4you"

# 3. Verify row counts
docker exec gigs4you_postgres psql -U admin -d gigs4you `
  -c "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM transactions;"
```

### From MinIO

```powershell
# 1. List available backups
mc ls gigs4you/gigs4you/backups/

# 2. Download the chosen backup
mc cp gigs4you/gigs4you/backups/gigs4you_2026-04-19_00-00.sql.gz $env:TEMP\

# 3. Restore (same as above)
docker cp "$env:TEMP\gigs4you_2026-04-19_00-00.sql.gz" gigs4you_postgres:/tmp/restore.sql.gz
docker exec gigs4you_postgres bash -c `
  "gunzip -c /tmp/restore.sql.gz | psql -U admin -d gigs4you"
```

---

## Restore Checklist

| Step | Action | Verified |
|------|--------|---------|
| 1 | Stop API container to prevent writes during restore | `docker compose stop api` |
| 2 | Create a safety dump of current state | Run `backup.ps1` manually |
| 3 | Drop and recreate database | `DROP DATABASE gigs4you; CREATE DATABASE gigs4you;` |
| 4 | Restore from backup | `gunzip | psql` command above |
| 5 | Run pending migrations | `npm run migration:run` |
| 6 | Verify row counts | `SELECT COUNT(*) FROM users;` |
| 7 | Start API | `docker compose start api` |
| 8 | Smoke test | `curl /api/v1/health` → `{"status":"ok"}` |

---

## RTO / RPO Targets

| Metric | Target |
|--------|--------|
| RPO (max data loss) | 12 hours |
| RTO (time to restore) | < 30 minutes for a 1 GB database |

To improve RPO below 12 hours: reduce the schedule interval in Task Scheduler
or configure Postgres WAL archiving to MinIO for continuous archiving.

---

## Monitoring

The backup script logs to `scripts\backup.log`. Check it weekly or set up a
Windows Event Log alert on script failures:

```powershell
# Check last backup result
Get-Content "C:\Users\PeterMuchene\Dev\Gigs4You\scripts\backup.log" | Select-Object -Last 20

# Check next scheduled run
Get-ScheduledTask -TaskName "Gigs4You DB Backup" | Select-Object -ExpandProperty NextRunTime
```

The Prometheus alert `RetentionCronNotRunning` in
`monitoring/prometheus/alerts/infrastructure.yml` covers application-level
data retention. A separate uptime check on the Task Scheduler job (via a
Windows heartbeat script) is recommended for production.
