# ==============================================================================
# SentinelOpsAI — Kubernetes Automated Rollout Script (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\deploy-k8s.ps1 [-DockerUser "maheshkumars772"]
# ==============================================================================

param (
    [string]$DockerUser = "maheshkumars772"
)

$ErrorActionPreference = "Stop"
$Namespace = "sentinelopsai"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " SentinelOpsAI — Deploying to Kubernetes" -ForegroundColor Cyan
Write-Host " Namespace     : $Namespace" -ForegroundColor Yellow
Write-Host " Registry User : $DockerUser" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Verify cluster connection
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Error "kubectl CLI is not installed or not in PATH."
}

# 2. Apply namespace
Write-Host ">>> Applying namespace..." -ForegroundColor Green
kubectl apply -f "$RootDir\k8s\00-namespace.yaml"

# 3. Create or update backend secrets
Write-Host ">>> Configuring backend secrets..." -ForegroundColor Green
kubectl create secret generic backend-secrets `
    --namespace="$Namespace" `
    --from-literal=MONGODB_URI="mongodb://mongodb.$($Namespace).svc.cluster.local:27017/sentinelops" `
    --from-literal=JWT_SECRET="sentinelops-super-secret-jwt-key" `
    --dry-run=client -o yaml | kubectl apply -f -

# 4. Apply backend ConfigMap
Write-Host ">>> Applying backend ConfigMap..." -ForegroundColor Green
kubectl apply -f "$RootDir\k8s\backend\backend-configmap.yaml"

# 5. Deploy MongoDB
Write-Host ">>> Deploying MongoDB..." -ForegroundColor Green
kubectl apply -f "$RootDir\k8s\mongodb\"
kubectl rollout status deployment/mongodb -n "$Namespace" --timeout=90s

# 6. Deploy Backend
Write-Host ">>> Deploying Backend..." -ForegroundColor Green
kubectl apply -f "$RootDir\k8s\backend\backend-deployment.yaml"
kubectl apply -f "$RootDir\k8s\backend\backend-service.yaml"
kubectl rollout status deployment/backend -n "$Namespace" --timeout=90s

# 7. Deploy Frontend
Write-Host ">>> Deploying Frontend..." -ForegroundColor Green
kubectl apply -f "$RootDir\k8s\frontend\"
kubectl rollout status deployment/frontend -n "$Namespace" --timeout=90s

# 8. Deploy Collector Service
Write-Host ">>> Deploying Collector Service..." -ForegroundColor Green
kubectl apply -f "$RootDir\k8s\collector\"
kubectl rollout status deployment/collector-service -n "$Namespace" --timeout=90s

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " Deployment Complete! Status Summary:" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
kubectl get pods -n "$Namespace" -o wide
Write-Host ""
kubectl get services -n "$Namespace"
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "`n>>> Access Commands:" -ForegroundColor Yellow
Write-Host "  Frontend Web UI : kubectl port-forward svc/frontend -n $Namespace 8080:80"
Write-Host "                    -> Open http://localhost:8080"
Write-Host "  Backend API     : kubectl port-forward svc/backend -n $Namespace 3000:3000"
Write-Host "                    -> Health check: curl http://localhost:3000/health"
Write-Host "  Collector API   : kubectl port-forward svc/collector-service -n $Namespace 8000:8000"
Write-Host "                    -> Health check: curl http://localhost:8000/health"
Write-Host "========================================================" -ForegroundColor Cyan
