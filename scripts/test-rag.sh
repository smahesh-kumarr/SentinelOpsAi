#!/bin/bash
# ==============================================================================
# SentinelOpsAI — AI Root Cause Analysis & RAG Verification Script
# ==============================================================================
# Usage:
#   ./scripts/test-rag.sh
# ==============================================================================

set -e

NAMESPACE="sentinelopsai"

echo "========================================================"
echo " SentinelOpsAI — Verifying AI Root Cause Analysis & RAG"
echo " Namespace: $NAMESPACE"
echo "========================================================"

# 1. Verify Qdrant and AI Service are running
echo ""
echo ">>> Checking Qdrant and AI Service rollout status..."
kubectl rollout status deployment/qdrant -n "$NAMESPACE" --timeout=60s
kubectl rollout status deployment/ai-service -n "$NAMESPACE" --timeout=60s

AI_POD=$(kubectl get pods -n "$NAMESPACE" -l app=ai-service -o jsonpath='{.items[0].metadata.name}')
QDRANT_POD=$(kubectl get pods -n "$NAMESPACE" -l app=qdrant -o jsonpath='{.items[0].metadata.name}')

echo "✓ AI Service pod : $AI_POD"
echo "✓ Qdrant pod     : $QDRANT_POD"

# 2. Check health endpoint of AI Service
echo ""
echo ">>> Testing /health endpoint on AI Service..."
kubectl exec -n "$NAMESPACE" "$AI_POD" -- python3 -c "
import urllib.request, json
resp = urllib.request.urlopen('http://localhost:8002/health')
data = json.loads(resp.read().decode('utf-8'))
print('✓ Health Status:', data.get('status'))
print('✓ Mongo Connected:', data.get('mongoConnected'))
print('✓ Qdrant Connected:', data.get('qdrantConnected'))
print('✓ Indexed Runbook Chunks:', data.get('indexedRunbookChunks'))
assert data.get('indexedRunbookChunks', 0) > 0, 'No runbooks indexed!'
"

# 3. Test RAG Semantic Vector Retrieval
echo ""
echo ">>> Testing RAG Semantic Search (/rag/search?q=OutOfMemory)..."
kubectl exec -n "$NAMESPACE" "$AI_POD" -- python3 -c "
import urllib.request, json, urllib.parse
q = urllib.parse.quote('OutOfMemory heap limit container killed')
resp = urllib.request.urlopen(f'http://localhost:8002/rag/search?q={q}')
data = json.loads(resp.read().decode('utf-8'))
ctx = data.get('retrieved_context', '')
print('✓ RAG Retrieval Output Preview:')
print(ctx[:300] + '...\n')
assert 'oom_handling.md' in ctx, 'Expected oom_handling.md to be retrieved!'
print('✓ SUCCESS: Vector RAG correctly retrieved grounded SRE runbook!')
"

# 4. Trigger AI Root Cause Analysis
echo ""
echo ">>> Triggering AI Root Cause Analysis (/analyze/now)..."
kubectl exec -n "$NAMESPACE" "$AI_POD" -- python3 -c "
import urllib.request, json

req = urllib.request.Request('http://localhost:8002/analyze/now', data=b'', method='POST')
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode('utf-8'))
print('✓ Analysis Cycle Status:', data.get('status'))
print('✓ Unanalyzed Incidents Processed:', data.get('unanalyzed_count'))
print('✓ Incidents Analyzed:', data.get('analyzed_count'))
for inc in data.get('incidents', []):
    print(f'   -> [{inc.get(\"incident_type\")}] {inc.get(\"title\")}')
    print(f'      Confidence: {inc.get(\"confidence\")}%')
    print(f'      Auto-approved Actions: {inc.get(\"auto_approved_actions\")}')
"

# 5. Inspect Analyzed Incident Details & Policy Recommendations
echo ""
echo "========================================================"
echo " SentinelOpsAI — AI RCA & Policy Recommendations Report"
echo "========================================================"
kubectl exec -n "$NAMESPACE" "$AI_POD" -- python3 -c "
import urllib.request, json

resp = urllib.request.urlopen('http://localhost:8002/incidents/analyzed?limit=1')
data = json.loads(resp.read().decode('utf-8'))
incidents = data.get('incidents', [])
if not incidents:
    print('✗ Warning: No analyzed incidents found in DB.')
    exit(0)

inc = incidents[0]
print(f'Incident ID : {inc.get(\"id\")}')
print(f'Title       : {inc.get(\"title\")}')
print(f'Type        : {inc.get(\"incident_type\")}')
print(f'Service     : {inc.get(\"service\")}')
print(f'Status      : {inc.get(\"status\")}')
print(f'Confidence  : {inc.get(\"confidence\")}%')
print(f'\nRoot Cause Diagnosis:')
print(f'  {inc.get(\"root_cause\")}')

print(f'\nPolicy-Governed Recommendations ({len(inc.get(\"recommendations\", []))}):')
for idx, rec in enumerate(inc.get('recommendations', []), 1):
    approval_tag = '[AUTO-APPROVED]' if not rec.get('approval_required') else '[HUMAN-APPROVAL-REQUIRED]'
    print(f'  {idx}. {approval_tag} Risk: {rec.get(\"risk\").upper()}')
    print(f'     Action : {rec.get(\"action\")}')
    print(f'     Command: {rec.get(\"suggested_command\")}')
    print(f'     Status : {rec.get(\"status\")}')
"

echo ""
echo "✓ PHASE 9 (AI ROOT CAUSE ANALYSIS & RAG SERVICE) VERIFICATION COMPLETE!"
