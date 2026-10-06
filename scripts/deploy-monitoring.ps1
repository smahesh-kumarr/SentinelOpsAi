# ==============================================================================
# SentinelOpsAI — Prometheus & Grafana Monitoring Deployment Script (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\deploy-monitoring.ps1
# ==============================================================================

$ErrorActionPreference = "Stop"
$Namespace = "monitoring"
$AppNamespace = "sentinelopsai"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " SentinelOpsAI — Deploying Monitoring Stack (PowerShell)" -ForegroundColor Cyan
Write-Host " Monitoring NS  : $Namespace" -ForegroundColor Yellow
Write-Host " Application NS : $AppNamespace" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Verify cluster connection
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Error "kubectl CLI is not installed or not in PATH."
}

# 2. Check for Helm
if (-not (Get-Command helm -ErrorAction SilentlyContinue)) {
    Write-Error "Helm CLI is not installed. Please install Helm from https://helm.sh/docs/intro/install/."
}

# 3. Add repo
Write-Host ">>> Updating Prometheus Community Helm repository..." -ForegroundColor Green
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 4. Install / upgrade
Write-Host ">>> Installing kube-prometheus-stack via Helm..." -ForegroundColor Green
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack `
    --namespace "$Namespace" `
    --create-namespace `
    --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false `
    --set grafana.sidecar.dashboards.enabled=true `
    --set grafana.sidecar.dashboards.searchNamespace=ALL

kubectl rollout status deployment/monitoring-kube-prometheus-operator -n "$Namespace" --timeout=120s
kubectl rollout status deployment/monitoring-grafana -n "$Namespace" --timeout=120s

# 5. Apply ServiceMonitor and Dashboard
Write-Host ">>> Applying backend ServiceMonitor..." -ForegroundColor Green
kubectl apply -f "$RootDir\k8s\monitoring\backend-servicemonitor.yaml"

Write-Host ">>> Applying SentinelOps custom Grafana dashboard..." -ForegroundColor Green
kubectl apply -f "$RootDir\k8s\monitoring\sentinelops-grafana-dashboard.yaml"

# 6. Retrieve password
$encodedPw = kubectl get secret monitoring-grafana -n "$Namespace" -o jsonpath="{.data.admin-password}"
$grafanaPw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encodedPw))

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " Monitoring Stack Deployed Successfully!" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Grafana Credentials:" -ForegroundColor Yellow
Write-Host "   Username : admin"
Write-Host "   Password : $grafanaPw"
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "`n>>> Access Commands:" -ForegroundColor Yellow
Write-Host "  1. Grafana Dashboard:"
Write-Host "     kubectl port-forward svc/monitoring-grafana -n $Namespace 3001:80"
Write-Host "     -> Open: http://localhost:3001"
Write-Host "`n  2. Prometheus Web UI:"
Write-Host "     kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n $Namespace 9090:9090"
Write-Host "     -> Open: http://localhost:9090/targets"
Write-Host "========================================================" -ForegroundColor Cyan
