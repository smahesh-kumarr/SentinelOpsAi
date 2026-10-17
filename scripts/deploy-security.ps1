# ==============================================================================
# SentinelOpsAI — Falco Security Deployment Script (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\deploy-security.ps1
# ==============================================================================

$ErrorActionPreference = "Stop"
$Namespace = "falco"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " SentinelOpsAI — Deploying Runtime Security (Falco)" -ForegroundColor Cyan
Write-Host " Namespace : $Namespace" -ForegroundColor Yellow
Write-Host " Driver    : modern_ebpf" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Error "kubectl CLI is not installed or not in PATH."
}

if (-not (Get-Command helm -ErrorAction SilentlyContinue)) {
    Write-Error "Helm CLI is not installed. Please install Helm from https://helm.sh/docs/intro/install/."
}

Write-Host ">>> Updating Falco Community Helm repository..." -ForegroundColor Green
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update

Write-Host ">>> Installing/Upgrading Falco..." -ForegroundColor Green
helm upgrade --install falco falcosecurity/falco `
    --namespace "$Namespace" `
    --create-namespace `
    --values "$RootDir\k8s\security\falco-values.yaml"

kubectl rollout status daemonset/falco -n "$Namespace" --timeout=180s
kubectl rollout status deployment/falco-falcosidekick -n "$Namespace" --timeout=120s

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " Falco Security Stack Deployed Successfully!" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
kubectl get pods -n "$Namespace" -o wide
Write-Host "`n>>> Next Steps:" -ForegroundColor Yellow
Write-Host "  1. View Falcosidekick WebUI: kubectl port-forward svc/falco-falcosidekick-ui -n $Namespace 2802:2802"
Write-Host "  2. Run security test: bash ./scripts/test-security.sh on Ubuntu VM"
Write-Host "========================================================" -ForegroundColor Cyan
