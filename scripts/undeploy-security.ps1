# ==============================================================================
# SentinelOpsAI — Falco Security Teardown Script (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\undeploy-security.ps1
# ==============================================================================

$ErrorActionPreference = "Stop"
$Namespace = "falco"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " SentinelOpsAI — Tearing Down Security Stack (Falco)" -ForegroundColor Cyan
Write-Host " Namespace : $Namespace" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

Write-Host ">>> Uninstalling Helm release 'falco'..." -ForegroundColor Green
helm uninstall falco -n "$Namespace"

Write-Host ">>> Deleting '$Namespace' namespace..." -ForegroundColor Green
kubectl delete namespace "$Namespace" --ignore-not-found=true

Write-Host "✓ Falco security stack completely uninstalled." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
