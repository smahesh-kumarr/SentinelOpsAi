# ==============================================================================
# SentinelOpsAI — Kubernetes Teardown / Cleanup Script (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\undeploy-k8s.ps1                 # Deletes all resources & the namespace
#   .\scripts\undeploy-k8s.ps1 -KeepNamespace # Deletes workloads but keeps namespace
# ==============================================================================

param (
    [switch]$KeepNamespace = $false
)

$ErrorActionPreference = "Stop"
$Namespace = "sentinelopsai"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " SentinelOpsAI — Teardown & Resource Cleanup" -ForegroundColor Cyan
Write-Host " Target Namespace : $Namespace" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Error "kubectl CLI is not installed or not in PATH."
}

if ($KeepNamespace) {
    Write-Host ">>> Deleting Collector Service..." -ForegroundColor Green
    kubectl delete -f "$RootDir\k8s\collector\" --ignore-not-found=true

    Write-Host ">>> Deleting Frontend..." -ForegroundColor Green
    kubectl delete -f "$RootDir\k8s\frontend\" --ignore-not-found=true

    Write-Host ">>> Deleting Backend..." -ForegroundColor Green
    kubectl delete -f "$RootDir\k8s\backend\" --ignore-not-found=true

    Write-Host ">>> Deleting Backend Secret..." -ForegroundColor Green
    kubectl delete secret backend-secrets -n "$Namespace" --ignore-not-found=true

    Write-Host ">>> Deleting MongoDB..." -ForegroundColor Green
    kubectl delete -f "$RootDir\k8s\mongodb\" --ignore-not-found=true

    Write-Host "✓ Workloads deleted. Namespace '$Namespace' preserved." -ForegroundColor Green
} else {
    Write-Host ">>> Deleting entire '$Namespace' namespace (and all contained resources)..." -ForegroundColor Yellow
    kubectl delete namespace "$Namespace" --ignore-not-found=true
    Write-Host "✓ Namespace '$Namespace' and all resources have been completely removed!" -ForegroundColor Green
}

Write-Host "========================================================" -ForegroundColor Cyan
