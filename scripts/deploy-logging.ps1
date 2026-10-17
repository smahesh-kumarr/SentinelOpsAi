# ==============================================================================
# SentinelOpsAI — Loki & Promtail Logging Deployment Script (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\deploy-logging.ps1
# ==============================================================================

$ErrorActionPreference = "Stop"
$Namespace = "monitoring"
$AppNamespace = "sentinelopsai"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " SentinelOpsAI — Deploying Centralized Logging (Loki)" -ForegroundColor Cyan
Write-Host " Namespace : $Namespace" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Verify cluster connection
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Error "kubectl CLI is not installed or not in PATH."
}

# 2. Check for Helm
if (-not (Get-Command helm -ErrorAction SilentlyContinue)) {
    Write-Error "Helm CLI is not installed. Please install Helm from https://helm.sh/docs/intro/install/."
}

# 3. Add and update repo
Write-Host ">>> Updating Grafana Helm repository..." -ForegroundColor Green
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# 4. Deploy loki-stack
Write-Host ">>> Installing/Upgrading loki-stack..." -ForegroundColor Green
helm upgrade --install loki grafana/loki-stack `
    --namespace "$Namespace" `
    --values "$RootDir\k8s\logging\promtail-values.yaml"

# 5. Apply DataSource
Write-Host ">>> Applying Grafana Loki DataSource ConfigMap..." -ForegroundColor Green
kubectl apply -f "$RootDir\k8s\logging\grafana-loki-datasource.yaml"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " Logging Stack Deployed Successfully!" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
kubectl get pods -n "$Namespace" | Select-String "loki|promtail"
Write-Host "`n>>> Verification in Grafana:" -ForegroundColor Yellow
Write-Host "  1. Port-forward Grafana: kubectl port-forward svc/monitoring-grafana -n $Namespace 3001:80"
Write-Host "  2. Open Grafana: http://localhost:3001"
Write-Host "  3. Go to Explore -> select 'Loki' -> run query: {app=""backend""} | json | level=""error"""
Write-Host "========================================================" -ForegroundColor Cyan
