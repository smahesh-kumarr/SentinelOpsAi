# ==============================================================================
# SentinelOpsAI — Background Port-Forwarding Manager (PowerShell)
# ==============================================================================
# Usage:
#   .\scripts\port-forward.ps1 -Action start
#   .\scripts\port-forward.ps1 -Action stop
#   .\scripts\port-forward.ps1 -Action status
# ==============================================================================

param (
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "start"
)

$ErrorActionPreference = "SilentlyContinue"

$services = @(
    @{ Name = "frontend"; Target = "svc/frontend"; Namespace = "sentinelopsai"; Port = "8080:80"; Desc = "Workload Frontend UI (TaskFlow)" },
    @{ Name = "backend"; Target = "svc/backend"; Namespace = "sentinelopsai"; Port = "3000:3000"; Desc = "Workload API & /simulate" },
    @{ Name = "monitoring-frontend"; Target = "svc/monitoring-frontend"; Namespace = "sentinelopsai"; Port = "8090:80"; Desc = "SRE Command Center Dashboard" },
    @{ Name = "monitoring-backend"; Target = "svc/monitoring-backend"; Namespace = "sentinelopsai"; Port = "3002:3002"; Desc = "SRE API Gateway" },
    @{ Name = "grafana"; Target = "svc/monitoring-grafana"; Namespace = "monitoring"; Port = "3001:80"; Desc = "Grafana (admin / prom-operator)" },
    @{ Name = "prometheus"; Target = "svc/monitoring-kube-prometheus-prometheus"; Namespace = "monitoring"; Port = "9090:9090"; Desc = "Prometheus Metrics UI" },
    @{ Name = "falcosidekick"; Target = "svc/falco-falcosidekick-ui"; Namespace = "falco"; Port = "2802:2802"; Desc = "Falco Security UI (admin / admin)" },
    @{ Name = "collector"; Target = "svc/collector-service"; Namespace = "sentinelopsai"; Port = "8000:8000"; Desc = "Telemetry Collector API" },
    @{ Name = "correlation"; Target = "svc/correlation-engine"; Namespace = "sentinelopsai"; Port = "8001:8001"; Desc = "Correlation Engine API" },
    @{ Name = "ai-service"; Target = "svc/ai-service"; Namespace = "sentinelopsai"; Port = "8002:8002"; Desc = "AI RCA & RAG API" },
    @{ Name = "ai-agent"; Target = "svc/ai-agent"; Namespace = "sentinelopsai"; Port = "8003:8003"; Desc = "Remediation Agent API" },
    @{ Name = "qdrant"; Target = "svc/qdrant"; Namespace = "sentinelopsai"; Port = "6333:6333"; Desc = "Qdrant Vector DB Web Console" }
)

function Stop-AllPorts {
    Write-Host ">>> Stopping any active background kubectl port-forwards..." -ForegroundColor Yellow
    Get-Process -Name kubectl -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*port-forward*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "✓ All port-forward processes stopped." -ForegroundColor Green
}

function Start-AllPorts {
    Stop-AllPorts
    Write-Host "`n==========================================================================" -ForegroundColor Cyan
    Write-Host " SentinelOpsAI — Starting All Background Port-Forwards" -ForegroundColor Cyan
    Write-Host "==========================================================================" -ForegroundColor Cyan

    foreach ($s in $services) {
        $p = $s.Port.Split(":")[0]
        Start-Process -FilePath "kubectl" -ArgumentList "port-forward", "--address", "0.0.0.0", $s.Target, $s.Port, "-n", $s.Namespace -WindowStyle Hidden
        Write-Host "  [STARTED] $($s.Name) -> Port $p" -ForegroundColor Green
    }

    Start-Sleep -Seconds 2

    Write-Host "`n==========================================================================" -ForegroundColor Cyan
    Write-Host " 🌐 SentinelOpsAI Live Services Dashboard" -ForegroundColor Cyan
    Write-Host "==========================================================================" -ForegroundColor Cyan
    foreach ($s in $services) {
        $p = $s.Port.Split(":")[0]
        Write-Host ("{0,-15} | http://localhost:{1,-5} | {2}" -f $s.Name, $p, $s.Desc) -ForegroundColor Yellow
    }
    Write-Host "==========================================================================`n" -ForegroundColor Cyan
}

if ($Action -eq "start") { Start-AllPorts }
elseif ($Action -eq "stop") { Stop-AllPorts }
elseif ($Action -eq "restart") { Stop-AllPorts; Start-Sleep -Seconds 1; Start-AllPorts }
elseif ($Action -eq "status") {
    Write-Host "Checking active kubectl port-forward processes..." -ForegroundColor Cyan
    Get-Process -Name kubectl -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, StartTime
}
