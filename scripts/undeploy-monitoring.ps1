# ==============================================================================
# SentinelOpsAI — Prometheus & Grafana Monitoring Teardown Script (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\undeploy-monitoring.ps1
# ==============================================================================

$ErrorActionPreference = "Stop"
$Namespace = "monitoring"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " SentinelOpsAI — Tearing Down Monitoring Stack" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

Write-Host ">>> Removing backend ServiceMonitor..." -ForegroundColor Green
kubectl delete -f "$RootDir\k8s\monitoring\backend-servicemonitor.yaml" --ignore-not-found=true

Write-Host ">>> Uninstalling Helm release 'monitoring'..." -ForegroundColor Green
helm uninstall monitoring -n "$Namespace"

Write-Host ">>> Deleting '$Namespace' namespace..." -ForegroundColor Green
kubectl delete namespace "$Namespace" --ignore-not-found=true

Write-Host "✓ Monitoring stack completely removed!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
