# ==============================================================================
# SentinelOpsAI — Loki & Promtail Logging Teardown Script (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\undeploy-logging.ps1
# ==============================================================================

$ErrorActionPreference = "Stop"
$Namespace = "monitoring"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " SentinelOpsAI — Tearing Down Logging Stack (Loki)" -ForegroundColor Cyan
Write-Host " Namespace : $Namespace" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

Write-Host ">>> Removing Grafana Loki DataSource ConfigMap..." -ForegroundColor Green
kubectl delete -f "$RootDir\k8s\logging\grafana-loki-datasource.yaml" --ignore-not-found=true

Write-Host ">>> Uninstalling Helm release 'loki'..." -ForegroundColor Green
helm uninstall loki -n "$Namespace"

Write-Host "✓ Logging stack uninstalled successfully." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
