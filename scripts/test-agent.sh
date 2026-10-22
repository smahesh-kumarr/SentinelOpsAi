#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Autonomous Remediation AI Agent Verification Script
# ==============================================================================
# Usage:
#   ./scripts/test-agent.sh
# ==============================================================================

set -e

NAMESPACE="sentinelopsai"

echo "========================================================"
echo " SentinelOpsAI — Verifying Autonomous Remediation Agent"
echo " Namespace: $NAMESPACE"
echo "========================================================"

# 1. Verify ai-agent pod is running
echo ""
echo ">>> Checking ai-agent rollout status..."
kubectl rollout status deployment/ai-agent -n "$NAMESPACE" --timeout=60s

AGENT_POD=$(kubectl get pods -n "$NAMESPACE" -l app=ai-agent -o jsonpath='{.items[0].metadata.name}')
echo "✓ AI Agent pod: $AGENT_POD"

# 2. Check health endpoint of AI Agent
echo ""
echo ">>> Testing /health endpoint on AI Agent..."
kubectl exec -n "$NAMESPACE" "$AGENT_POD" -- python3 -c "
import urllib.request, json
resp = urllib.request.urlopen('http://localhost:8003/health')
data = json.loads(resp.read().decode('utf-8'))
print('✓ Health Status  :', data.get('status'))
print('✓ Mongo Connected:', data.get('mongoConnected'))
print('✓ K8s Connected  :', data.get('k8sConnected'))
print('✓ Active Jobs    :', data.get('activeJobs'))
assert data.get('mongoConnected'), 'MongoDB is not connected!'
"

# 3. Trigger Autonomous Remediation Cycle
echo ""
echo ">>> Triggering Autonomous Remediation (/remediate/now)..."
kubectl exec -n "$NAMESPACE" "$AGENT_POD" -- python3 -c "
import urllib.request, json

req = urllib.request.Request('http://localhost:8003/remediate/now', data=b'', method='POST')
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode('utf-8'))
print('✓ Remediation Cycle Status:', data.get('status'))
print('✓ Pending Incidents Found :', data.get('pending_count'))
print('✓ Actions Remediated      :', data.get('executed_count'))
for r in data.get('remediated', []):
    print(f'   -> Service : {r.get(\"service\")}')
    print(f'      Action  : {r.get(\"action\")}')
    print(f'      Status  : {r.get(\"status\")}')
    print(f'      Outcome : {r.get(\"verification\", {}).get(\"message\")}')
"

# 4. Verify Workload Recovery on Cluster
echo ""
echo ">>> Verifying Deployment Rollout on Kubernetes..."
kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=60s
echo "✓ Backend deployment successfully rolled out and healthy!"

# 5. Check Audit Trail
echo ""
echo "========================================================"
echo " SentinelOpsAI — Remediation Audit Trail Report"
echo "========================================================"
kubectl exec -n "$NAMESPACE" "$AGENT_POD" -- python3 -c "
import urllib.request, json

resp = urllib.request.urlopen('http://localhost:8003/audit/history?limit=5')
data = json.loads(resp.read().decode('utf-8'))
for idx, entry in enumerate(data.get('audit_trail', []), 1):
    print(f'{idx}. [{entry.get(\"timestamp\")}] [{entry.get(\"executor\").upper()}]')
    print(f'   Service: {entry.get(\"service\")}')
    print(f'   Action : {entry.get(\"action_key\")}')
    print(f'   Command: {entry.get(\"command\")}')
    print(f'   Status : {entry.get(\"status\")}')
    print('')
"

echo ""
echo "✓ PHASE 11 (AUTONOMOUS REMEDIATION AI AGENT) VERIFICATION COMPLETE!"
