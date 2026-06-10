# Naukri Automation - Scheduled Runner
# This script is triggered every 3 hours by Windows Task Scheduler

$scriptDir = "D:\Naukari automachine"
$logFile = "$scriptDir\logs\scheduler.log"

# Ensure logs directory exists
if (-not (Test-Path "$scriptDir\logs")) {
    New-Item -ItemType Directory -Path "$scriptDir\logs" | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "[$timestamp] Starting Naukri automation run..."

try {
    # Change to project directory and run the bot
    Set-Location $scriptDir
    $result = node src/naukri-automation.js 2>&1
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logFile -Value "[$timestamp] Run complete."
    Add-Content -Path $logFile -Value $result
} catch {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logFile -Value "[$timestamp] ERROR: $_"
}
