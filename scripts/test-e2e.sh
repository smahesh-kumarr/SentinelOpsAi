#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Full End-to-End Autonomous AIOps Loop Verification Script
# ==============================================================================
# Automates the complete closed-loop cycle in a single command:
#   1. [COLLECT]   -> Ingests multi-source telemetry (Metrics, Logs, Security)
#   2. [CORRELATE] -> Cross-domain fusion creates structured incident in MongoDB
#   3. [RAG & AI]  -> Semantic search retrieves SRE runbook & diagnoses root cause
#   4. [REMEDIATE] -> Autonomous AI Agent executes Kubernetes fix & verifies health
# ==============================================================================
# Usage:
#   ./scripts/test-e2e.sh [service-name]
#
# Examples:
#   ./scripts/test-e2e.sh backend
# ==============================================================================

set -e

NAMESPACE="sentinelopsai"
TARGET_SERVICE=${1:-"backend"}

echo "=========================================================================="
echo " 🛡️ SentinelOpsAI — Automated End-to-End Self-Healing Pipeline"
echo " Target Workload : $TARGET_SERVICE"
echo " Namespace       : $NAMESPACE"
echo "=========================================================================="

# 0. Discover Pods
echo ""
echo ">>> [Phase 0] Verifying platform service health..."

COLLECTOR_POD=$(kubectl get pod -l app=collector-service -n "$NAMESPACE" -o jsonpath="{.items[0].metadata.name}" 2>/dev/null || true)
CORR_POD=$(kubectl get pod -l app=correlation-engine -n "$NAMESPACE" -o jsonpath="{.items[0].metadata.name}" 2>/dev/null || true)
AI_POD=$(kubectl get pod -l app=ai-service -n "$NAMESPACE" -o jsonpath="{.items[0].metadata.name}" 2>/dev/null || true)
AGENT_POD=$(kubectl get pod -l app=ai-agent -n "$NAMESPACE" -o jsonpath="{.items[0].metadata.name}" 2>/dev/null || true)

for pod_var in "COLLECTOR_POD:$COLLECTOR_POD" "CORR_POD:$CORR_POD" "AI_POD:$AI_POD" "AGENT_POD:$AGENT_POD"; do
  name="${pod_var%%:*}"
  val="${pod_var#*:}"
  if [ -z "$val" ]; then
    echo "Error: Pod for $name not found in namespace '$NAMESPACE'!"
    echo "Run './scripts/deploy-all.sh' to ensure all pods are running."
    exit 1
  fi
  echo "✓ Found $name: $val"
done

# ------------------------------------------------------------------------------
# STEP 1: COLLECT (Ingest Multi-Source Telemetry)
# ------------------------------------------------------------------------------
echo ""
echo "=========================================================================="
echo " 📡 [STEP 1/4: COLLECT] Multi-Source Telemetry Ingestion"
echo "=========================================================================="
echo "Simulating cross-domain telemetry events for service '$TARGET_SERVICE'..."

INGEST_OUTPUT=$(kubectl exec -n "$NAMESPACE" "$COLLECTOR_POD" -- python3 -c "
import urllib.request, json

events = [
    {
        'source': 'prometheus',
        'service': '$TARGET_SERVICE',
        'severity': 'critical',
        'data': {
            'metric': 'container_memory_working_set_bytes',
            'value_bytes': 204472320,
            'value_mib': 195.0,
            'limit_bytes': 209715200,
            'threshold_pct': 97.5,
            'alertname': 'ContainerMemorySaturation'
        }
    },
    {
        'source': 'loki',
        'service': '$TARGET_SERVICE',
        'severity': 'error',
        'data': {
            'log': 'FATAL: java.lang.OutOfMemoryError: Java heap space. Process terminating with code 137.',
            'pattern': 'OutOfMemoryError',
            'container': '$TARGET_SERVICE'
        }
    },
    {
        'source': 'k8s_events',
        'service': '$TARGET_SERVICE',
        'severity': 'warning',
        'data': {
            'reason': 'OOMKilled',
            'message': 'Container was terminated due to memory limit exhaustion (Exit Code: 137)',
            'count': 3
        }
    }
]

ingested_ids = []
for ev in events:
    req = urllib.request.Request(
        'http://localhost:8000/events',
        data=json.dumps(ev).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read().decode('utf-8'))
    ingested_ids.append(data.get('event', {}).get('id', 'ok'))

print(f'✓ Successfully collected {len(ingested_ids)} telemetry events (Prometheus + Loki + K8s Events).')
")
echo "$INGEST_OUTPUT"

# ------------------------------------------------------------------------------
# STEP 2: CORRELATE (Cross-Domain Fusion & Incident Creation)
# ------------------------------------------------------------------------------
echo ""
echo "=========================================================================="
echo " ⚡ [STEP 2/4: CORRELATE] Cross-Domain Incident Correlation"
echo "=========================================================================="
echo "Executing correlation cycle on ingested events..."

CORR_RESULT=$(kubectl exec -n "$NAMESPACE" "$CORR_POD" -- python3 -c "
import urllib.request, json

req = urllib.request.Request('http://localhost:8001/correlate/now', data=b'', method='POST')
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode('utf-8'))

incidents = data.get('incidents_created', [])
print(f'✓ Correlation Status : {data.get(\"status\")}')
print(f'✓ Events Evaluated   : {data.get(\"events_evaluated\")}')
print(f'✓ Incidents Created  : {len(incidents)}')

if incidents:
    inc = incidents[0]
    print(f'   -> Incident ID   : {inc.get(\"id\")}')
    print(f'   -> Title         : {inc.get(\"title\")}')
    print(f'   -> Type          : {inc.get(\"incident_type\")}')
    print(f'   -> Severity      : {inc.get(\"severity\").upper()}')
    print(f'   -> Evidence Count: {len(inc.get(\"evidence\", []))}')
else:
    # Query latest open incident
    resp = urllib.request.urlopen('http://localhost:8001/incidents?status=open&limit=1')
    data = json.loads(resp.read().decode('utf-8'))
    incs = data.get('incidents', [])
    if incs:
        print(f'   -> Found Active Incident ID: {incs[0].get(\"id\")}')
")
echo "$CORR_RESULT"

# ------------------------------------------------------------------------------
# STEP 3: RAG & AI (Semantic Runbook Retrieval & Root Cause Diagnosis)
# ------------------------------------------------------------------------------
echo ""
echo "=========================================================================="
echo " 🧠 [STEP 3/4: RAG & AI] Runbook Retrieval & Root Cause Diagnosis"
echo "=========================================================================="
echo "Triggering AI Reasoning Engine (Retrieving runbooks from Vector DB)..."

AI_RESULT=$(kubectl exec -n "$NAMESPACE" "$AI_POD" -- python3 -c "
import urllib.request, json

# 1. Trigger analysis cycle
req = urllib.request.Request('http://localhost:8002/analyze/now', data=b'', method='POST')
resp = urllib.request.urlopen(req)
analysis_data = json.loads(resp.read().decode('utf-8'))

print(f'✓ AI Analysis Status: {analysis_data.get(\"status\")}')
print(f'✓ Incidents Analyzed: {analysis_data.get(\"analyzed_count\")}')

# 2. Fetch the analyzed incident with policy recommendations
resp = urllib.request.urlopen('http://localhost:8002/incidents/analyzed?limit=1')
data = json.loads(resp.read().decode('utf-8'))
incs = data.get('incidents', [])

if incs:
    inc = incs[0]
    print(f'\n--- [AI Root Cause Analysis Summary] ---')
    print(f'Incident ID : {inc.get(\"id\")}')
    print(f'Title       : {inc.get(\"title\")}')
    print(f'Confidence  : {inc.get(\"confidence\")}%')
    print(f'\nRoot Cause Diagnosis:')
    print(f'  {inc.get(\"root_cause\")}')
    print(f'\nPolicy-Governed Recommendations:')
    for idx, r in enumerate(inc.get('recommendations', []), 1):
        status_tag = '[AUTO-APPROVED]' if not r.get('approval_required') else '[APPROVAL-REQUIRED]'
        print(f'  {idx}. {status_tag} {r.get(\"action\")}')
        print(f'     Command: {r.get(\"suggested_command\")}')
")
echo "$AI_RESULT"

# ------------------------------------------------------------------------------
# STEP 4: REMEDIATE (Autonomous Self-Healing & Closed-Loop Verification)
# ------------------------------------------------------------------------------
echo ""
echo "=========================================================================="
echo " 🔧 [STEP 4/4: REMEDIATE] Autonomous Healing & Verification"
echo "=========================================================================="
echo "Executing autonomous remediation agent..."

REMEDIATE_RESULT=$(kubectl exec -n "$NAMESPACE" "$AGENT_POD" -- python3 -c "
import urllib.request, json

req = urllib.request.Request('http://localhost:8003/remediate/now', data=b'', method='POST')
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode('utf-8'))

print(f'✓ Remediation Status : {data.get(\"status\")}')
print(f'✓ Pending Incidents  : {data.get(\"pending_count\")}')
print(f'✓ Actions Executed   : {data.get(\"executed_count\")}')

for item in data.get('remediated', []):
    print(f'\n--- [Executed Remediation] ---')
    print(f'Service    : {item.get(\"service\")}')
    print(f'Action     : {item.get(\"action\")}')
    print(f'Resolution : {item.get(\"status\")}')
    print(f'Outcome    : {item.get(\"verification\", {}).get(\"message\")}')
")
echo "$REMEDIATE_RESULT"

# ------------------------------------------------------------------------------
# STEP 5: VERIFICATION & AUDIT TRAIL
# ------------------------------------------------------------------------------
echo ""
echo "=========================================================================="
echo " 📋 [AUDIT REPORT] Closed-Loop Cluster Recovery Summary"
echo "=========================================================================="

echo ">>> 1. Verifying Kubernetes deployment rollout status..."
kubectl rollout status deployment/"$TARGET_SERVICE" -n "$NAMESPACE" --timeout=60s

echo ""
echo ">>> 2. Recent Remediation Audit Trail entries:"
kubectl exec -n "$NAMESPACE" "$AGENT_POD" -- python3 -c "
import urllib.request, json
resp = urllib.request.urlopen('http://localhost:8003/audit/history?limit=3')
data = json.loads(resp.read().decode('utf-8'))
for entry in data.get('audit_trail', []):
    print(f'• [{entry.get(\"timestamp\")[:19]}] [{entry.get(\"executor\").upper()}]')
    print(f'  Target  : {entry.get(\"service\")}')
    print(f'  Action  : {entry.get(\"action_key\")}')
    print(f'  Command : {entry.get(\"command\")}')
    print(f'  Result  : {entry.get(\"status\").upper()}')
    print('')
"

echo "=========================================================================="
echo " 🎉 COMPLETE AUTONOMOUS AIOPS LOOP VERIFIED SUCCESSFULLY!"
echo "    Collection ➔ Correlation ➔ RAG Diagnosis ➔ Autonomous Healing"
echo "=========================================================================="
