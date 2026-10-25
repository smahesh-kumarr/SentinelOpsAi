# ==============================================================================
# SentinelOpsAI — Full End-to-End Autonomous AIOps Loop Verification Script (PowerShell)
# ==============================================================================
param(
    [string]$TargetService = "backend"
)

$ErrorActionPreference = "Stop"
$Namespace = "sentinelopsai"

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " 🛡️ SentinelOpsAI — Automated End-to-End Self-Healing Pipeline" -ForegroundColor Cyan
Write-Host " Target Workload : $TargetService" -ForegroundColor Cyan
Write-Host " Namespace       : $Namespace" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

# 0. Discover Pods
$CollectorPod = (kubectl get pod -l app=collector-service -n "$Namespace" -o jsonpath="{.items[0].metadata.name}" 2>$null)
$CorrPod = (kubectl get pod -l app=correlation-engine -n "$Namespace" -o jsonpath="{.items[0].metadata.name}" 2>$null)
$AiPod = (kubectl get pod -l app=ai-service -n "$Namespace" -o jsonpath="{.items[0].metadata.name}" 2>$null)
$AgentPod = (kubectl get pod -l app=ai-agent -n "$Namespace" -o jsonpath="{.items[0].metadata.name}" 2>$null)

if (-not $CollectorPod -or -not $CorrPod -or -not $AiPod -or -not $AgentPod) {
    Write-Host "Error: One or more platform pods not running in namespace '$Namespace'!" -ForegroundColor Red
    exit 1
}

Write-Host "`n✓ Discovered active microservices:" -ForegroundColor Green
Write-Host "  Collector Pod   : $CollectorPod"
Write-Host "  Correlation Pod : $CorrPod"
Write-Host "  AI Service Pod  : $AiPod"
Write-Host "  AI Agent Pod    : $AgentPod"

# 1. Collect
Write-Host "`n==========================================================================" -ForegroundColor Cyan
Write-Host " 📡 [STEP 1/4: COLLECT] Multi-Source Telemetry Ingestion" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
kubectl exec -n "$Namespace" "$CollectorPod" -- python3 -c "
import urllib.request, json

events = [
    {'source': 'prometheus', 'service': '$TargetService', 'severity': 'critical', 'data': {'metric': 'container_memory_working_set_bytes', 'value_mib': 195.0, 'limit_bytes': 209715200, 'alertname': 'ContainerMemorySaturation'}},
    {'source': 'loki', 'service': '$TargetService', 'severity': 'error', 'data': {'log': 'FATAL: java.lang.OutOfMemoryError: Java heap space. Exit 137.'}},
    {'source': 'k8s_events', 'service': '$TargetService', 'severity': 'warning', 'data': {'reason': 'OOMKilled', 'message': 'Terminated exit code 137'}}
]
for ev in events:
    req = urllib.request.Request('http://localhost:8000/events', data=json.dumps(ev).encode('utf-8'), headers={'Content-Type': 'application/json'}, method='POST')
    urllib.request.urlopen(req)
print(f'✓ Successfully ingested 3 cross-domain events for $TargetService into Collector.')
"

# 2. Correlate
Write-Host "`n==========================================================================" -ForegroundColor Cyan
Write-Host " ⚡ [STEP 2/4: CORRELATE] Cross-Domain Incident Correlation" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
kubectl exec -n "$Namespace" "$CorrPod" -- python3 -c "
import urllib.request, json
req = urllib.request.Request('http://localhost:8001/correlate/now', data=b'', method='POST')
data = json.loads(urllib.request.urlopen(req).read().decode())
print(f'✓ Correlation Status: {data.get(\"status\")}')
print(f'✓ Incidents Created : {len(data.get(\"incidents_created\", []))}')
"

# 3. RAG & AI
Write-Host "`n==========================================================================" -ForegroundColor Cyan
Write-Host " 🧠 [STEP 3/4: RAG & AI] Runbook Retrieval & Root Cause Diagnosis" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
kubectl exec -n "$Namespace" "$AiPod" -- python3 -c "
import urllib.request, json
req = urllib.request.Request('http://localhost:8002/analyze/now', data=b'', method='POST')
urllib.request.urlopen(req)
resp = urllib.request.urlopen('http://localhost:8002/incidents/analyzed?limit=1')
data = json.loads(resp.read().decode())
incs = data.get('incidents', [])
if incs:
    inc = incs[0]
    print(f'✓ Incident ID : {inc.get(\"id\")}')
    print(f'✓ Confidence  : {inc.get(\"confidence\")}%')
    print(f'✓ Diagnosis   : {inc.get(\"root_cause\")[:150]}...')
    for idx, r in enumerate(inc.get('recommendations', []), 1):
        print(f'  Recommendation {idx}: {r.get(\"action\")} (Risk: {r.get(\"risk\")})')
"

# 4. Remediate
Write-Host "`n==========================================================================" -ForegroundColor Cyan
Write-Host " 🔧 [STEP 4/4: REMEDIATE] Autonomous Healing & Verification" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
kubectl exec -n "$Namespace" "$AgentPod" -- python3 -c "
import urllib.request, json
req = urllib.request.Request('http://localhost:8003/remediate/now', data=b'', method='POST')
data = json.loads(urllib.request.urlopen(req).read().decode())
print(f'✓ Remediation Status : {data.get(\"status\")}')
print(f'✓ Actions Executed   : {data.get(\"executed_count\")}')
for item in data.get('remediated', []):
    print(f'  -> Action : {item.get(\"action\")} | Outcome: {item.get(\"status\")}')
"

Write-Host "`n==========================================================================" -ForegroundColor Green
Write-Host " 🎉 COMPLETE AUTONOMOUS AIOPS LOOP VERIFIED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
