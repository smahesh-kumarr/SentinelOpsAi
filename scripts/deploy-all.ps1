# ==============================================================================
# SentinelOpsAI — Master Deployment Orchestration (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\deploy-all.ps1 [-NoPorts]
# ==============================================================================

param (
    [switch]$NoPorts = $false
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " 🛡️ SentinelOpsAI — Master Automated Deployment Pipeline (PowerShell)" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

# 1. Monitoring
Write-Host "`n[1/4] Deploying Monitoring Stack (Prometheus & Grafana)..." -ForegroundColor Green
& "$ScriptDir\deploy-monitoring.ps1"

# 2. Logging
Write-Host "`n[2/4] Deploying Logging Stack (Loki & Promtail)..." -ForegroundColor Green
& "$ScriptDir\deploy-logging.ps1"

# 3. Security
Write-Host "`n[3/4] Deploying Security Stack (Falco)..." -ForegroundColor Green
& "$ScriptDir\deploy-security.ps1"

# 4. App & AI Services
Write-Host "`n[4/4] Deploying App, Collector, Correlation, Vector DB & AI Services..." -ForegroundColor Green
& "$ScriptDir\deploy-k8s.ps1"

# 5. Background Port Forwarding
if (-not $NoPorts) {
    & "$ScriptDir\port-forward.ps1" -Action start
} else {
    Write-Host "`nPort forwarding skipped. Run .\scripts\port-forward.ps1 -Action start when ready." -ForegroundColor Yellow
}

Write-Host "`n==========================================================================" -ForegroundColor Cyan
Write-Host " 🎉 ALL SENTINELOPSAI COMPONENTS SUCCESSFULLY DEPLOYED & ACTIVE!" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
