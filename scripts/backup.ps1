Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$DB_CONTAINER      = "gigs4you_postgres"
$DB_NAME           = "gigs4you"
$DB_USER           = "admin"
$MC                = "C:\Users\PeterMuchene\Dev\Gigs4You\scripts\mc.exe"
$MINIO_ALIAS       = "gigs4you"
$MINIO_BUCKET      = "gigs4you"
$MINIO_PREFIX      = "backups"
$EXTERNAL_DIR      = "E:\Gigs4You KE\backups"
$RETAIN_DAYS_LOCAL = 30
$RETAIN_DAYS_MINIO = 90
$TIMESTAMP         = Get-Date -Format "yyyy-MM-dd_HH-mm"
$FILENAME          = "gigs4you_${TIMESTAMP}.sql.gz"
$TEMP_FILE         = Join-Path $env:TEMP $FILENAME

function Log($msg, $level = "INFO") {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$ts] [$level] $msg"
}

Log "Starting backup: $FILENAME"

$containerPath = "/tmp/$FILENAME"
docker exec $DB_CONTAINER bash -c "pg_dump -U $DB_USER -d $DB_NAME | gzip > $containerPath"
if ($LASTEXITCODE -ne 0) { Log "pg_dump failed (exit $LASTEXITCODE)" "ERROR"; exit 1 }

docker cp "${DB_CONTAINER}:${containerPath}" $TEMP_FILE
if ($LASTEXITCODE -ne 0) { Log "docker cp failed (exit $LASTEXITCODE)" "ERROR"; exit 1 }

docker exec $DB_CONTAINER rm -f $containerPath

$sizeMb = [math]::Round((Get-Item $TEMP_FILE).Length / 1MB, 2)
Log "Dump complete: ${sizeMb} MB"

if (Test-Path "E:") {
    if (-not (Test-Path $EXTERNAL_DIR)) {
        New-Item -ItemType Directory -Path $EXTERNAL_DIR -Force | Out-Null
    }
    Copy-Item -Path $TEMP_FILE -Destination (Join-Path $EXTERNAL_DIR $FILENAME) -Force
    Log "Copied to external drive: $FILENAME"

    $cutoff = (Get-Date).AddDays(-$RETAIN_DAYS_LOCAL)
    Get-ChildItem -Path $EXTERNAL_DIR -Filter "*.sql.gz" |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        ForEach-Object { Remove-Item $_.FullName -Force; Log "Pruned local: $($_.Name)" }
} else {
    Log "E:\ not found - skipping external drive" "WARN"
}

if (Test-Path $MC) {
    $dest = "${MINIO_ALIAS}/${MINIO_BUCKET}/${MINIO_PREFIX}/${FILENAME}"
    & $MC cp --quiet $TEMP_FILE $dest
    if ($LASTEXITCODE -eq 0) {
        Log "Uploaded to MinIO: ${MINIO_BUCKET}/${MINIO_PREFIX}/${FILENAME}"
    } else {
        Log "MinIO upload failed (exit $LASTEXITCODE)" "WARN"
    }
    $cutoffUtc = (Get-Date).ToUniversalTime().AddDays(-$RETAIN_DAYS_MINIO).ToString("o")
    & $MC ls --json "${MINIO_ALIAS}/${MINIO_BUCKET}/${MINIO_PREFIX}/" |
        Where-Object { $_ -match '"key"' } |
        ForEach-Object { $_ | ConvertFrom-Json } |
        Where-Object { $_.lastModified -lt $cutoffUtc -and $_.key -like "*.sql.gz" } |
        ForEach-Object { & $MC rm "${MINIO_ALIAS}/${MINIO_BUCKET}/${MINIO_PREFIX}/$($_.key)" | Out-Null; Log "Pruned MinIO: $($_.key)" }
} else {
    Log "mc.exe not found - skipping MinIO" "WARN"
}

Remove-Item -Path $TEMP_FILE -Force -ErrorAction SilentlyContinue
Log "Backup complete: $FILENAME"
