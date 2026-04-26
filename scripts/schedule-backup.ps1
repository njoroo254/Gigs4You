<#
.SYNOPSIS
    One-time setup: registers the backup job in Windows Task Scheduler.
    Run this once as Administrator.
#>

$scriptPath = "C:\Users\PeterMuchene\Dev\Gigs4You\scripts\backup.ps1"
$logPath    = "C:\Users\PeterMuchene\Dev\Gigs4You\scripts\backup.log"
$taskName   = "Gigs4You DB Backup"

# Run every 12 hours, starting now
$trigger = New-ScheduledTaskTrigger `
    -RepetitionInterval (New-TimeSpan -Hours 12) `
    -Once `
    -At (Get-Date)

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`" *>> `"$logPath`""

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -StartWhenAvailable

# Run as SYSTEM so it works even when you're not logged in
$principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName  $taskName `
    -Action    $action `
    -Trigger   $trigger `
    -Settings  $settings `
    -Principal $principal `
    -Force

Write-Host "Task '$taskName' registered. Next run: $((Get-ScheduledTask -TaskName $taskName).NextRunTime)"
Write-Host "Logs will be written to: $logPath"
Write-Host ""
Write-Host "To run a manual backup now:"
Write-Host "  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "  # or"
Write-Host "  powershell -File `"$scriptPath`""
