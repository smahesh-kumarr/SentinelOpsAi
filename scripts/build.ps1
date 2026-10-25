# ==============================================================================
# SentinelOpsAI — Container Build & Push Automation (Windows / PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\build.ps1 -DockerUser <username> -Version <v1> [-Push]
# ==============================================================================

param (
    [string]$DockerUser = "sentinelops",
    [string]$Version = "v1",
    [switch]$Push = $false
)

$ErrorActionPreference = "Stop"

$services = @(
    @{ Name = "backend"; Dir = "backend" },
    @{ Name = "frontend"; Dir = "frontend" },
    @{ Name = "collector-service"; Dir = "collector-service" },
    @{ Name = "correlation-engine"; Dir = "correlation-engine" },
    @{ Name = "ai-service"; Dir = "ai-service" },
    @{ Name = "ai-agent"; Dir = "ai-agent" },
    @{ Name = "monitoring-backend"; Dir = "monitoring-app/backend" },
    @{ Name = "monitoring-frontend"; Dir = "monitoring-app/frontend" }
)

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " SentinelOpsAI — Building Docker Images (PowerShell)" -ForegroundColor Cyan
Write-Host " Registry User : $DockerUser" -ForegroundColor Yellow
Write-Host " Version Tag   : $Version" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

# Check if Docker is available
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Warning "Docker CLI is not detected on this Windows environment."
    Write-Host "Per your project workflow, commit your changes, push to GitHub, and execute ./scripts/build.sh on your Linux Docker machine." -ForegroundColor Yellow
    exit 0
}

foreach ($svc in $services) {
    $imageTag = "$($DockerUser)/sentinelops-$($svc.Name):$($Version)"
    $latestTag = "$($DockerUser)/sentinelops-$($svc.Name):latest"

    Write-Host "`n>>> Building $($svc.Name) ($imageTag)..." -ForegroundColor Green
    docker build -t $imageTag -t $latestTag "./$($svc.Dir)"
    Write-Host "✓ Successfully built $imageTag" -ForegroundColor Green
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " Docker Images Built:" -ForegroundColor Cyan
docker images | Select-String "sentinelops"
Write-Host "========================================================" -ForegroundColor Cyan

if ($Push) {
    Write-Host "`n>>> Pushing images to DockerHub..." -ForegroundColor Green
    foreach ($svc in $services) {
        docker push "$($DockerUser)/sentinelops-$($svc.Name):$($Version)"
        docker push "$($DockerUser)/sentinelops-$($svc.Name):latest"
    }
    Write-Host "✓ All images pushed to DockerHub successfully!" -ForegroundColor Green
} else {
    Write-Host "`nNotice: Images built locally. To push to DockerHub, supply the -Push flag:" -ForegroundColor Yellow
    Write-Host '  .\scripts\build.ps1 -DockerUser <user> -Version <tag> -Push' -ForegroundColor White
}
