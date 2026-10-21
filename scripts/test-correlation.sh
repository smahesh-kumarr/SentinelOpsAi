#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Correlation Engine Verification Script
# ==============================================================================
# Usage:
#   ./scripts/test-correlation.sh
# ==============================================================================

set -e

NAMESPACE="sentinelopsai"

echo "========================================================"
echo " SentinelOpsAI — Verifying Cross-Domain Correlation"
echo " Namespace: $NAMESPACE"
echo "========================================================"

# 1. Verify correlation-engine pod is running
echo ""
echo ">>> Checking correlation-engine pod status..."
kubectl rollout status deployment/correlation-engine -n "$NAMESPACE" --timeout=60s

CORR_POD=$(kubectl get pods -n "$NAMESPACE" -l app=correlation-engine -o jsonpath='{.items[0].metadata.name}')
COLLECTOR_POD=$(kubectl get pods -n "$NAMESPACE" -l app=collector-service -o jsonpath='{.items[0].metadata.name}')

echo "✓ Correlation Engine pod: $CORR_POD"
echo "✓ Collector Service pod : $COLLECTOR_POD"

# 2. Check health endpoint of correlation engine
echo ""
echo ">>> Testing /health endpoint on correlation engine..."
kubectl exec -n "$NAMESPACE" "$CORR_POD" -- python3 -c "
import urllib.request, json
resp = urllib.request.urlopen('http://localhost:8001/health')
data = json.loads(resp.read().decode('utf-8'))
print('✓ Health Status:', data.get('status'))
print('✓ Mongo Connected:', data.get('mongoConnected'))
print('✓ Active Scheduler Jobs:', data.get('activeJobs'))
"

# 3. Simulate multi-source raw events into Collector for 'backend'
echo ""
echo ">>> Ingesting multi-source telemetry events to test cross-domain correlation..."

kubectl exec -n "$NAMESPACE" "$COLLECTOR_POD" -- python3 -c "
import urllib.request, json

events = [
    {
        'source': 'prometheus',
        'service': 'backend-79f98444dc-z98qk',
        'severity': 'warning',
        'data': {
            'metric': 'memory',
            'value_bytes': 199229440,
            'value_mib': 190.0,
            'limit_bytes': 209715200,
            'threshold_bytes': 188743680
        }
    },
    {
        'source': 'loki',
        'service': 'backend',
        'severity': 'error',
        'data': {
            'log': 'FATAL ERROR: Allocation failed - JavaScript heap out of memory',
            'pod': 'backend-79f98444dc-z98qk'
        }
    },
    {
        'source': 'k8s',
        'service': 'backend',
        'severity': 'critical',
        'data': {
            'pod': 'backend-79f98444dc-z98qk',
            'container': 'backend',
            'restart_count': 3,
            'terminated_reason': 'OOMKilled'
        }
    }
]

for ev in events:
    req = urllib.request.Request(
        'http://localhost:8000/events',
        data=json.dumps(ev).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    res = urllib.request.urlopen(req)
    print('✓ Ingested raw event from source:', ev['source'])
"

# 4. Trigger correlation cycle immediately
echo ""
echo ">>> Triggering cross-domain correlation cycle (/correlate/now)..."
kubectl exec -n "$NAMESPACE" "$CORR_POD" -- python3 -c "
import urllib.request, json

req = urllib.request.Request('http://localhost:8001/correlate/now', data=b'', method='POST')
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode('utf-8'))
print('✓ Correlation Result:', data.get('status'))
print('✓ Unprocessed Events Evaluated:', data.get('unprocessed_count'))
print('✓ New Incidents Created:', data.get('new_incidents_count'))
for inc in data.get('new_incidents', []):
    print(f'   -> [{inc.get(\"severity\").upper()}] {inc.get(\"incident_type\")}: {inc.get(\"title\")}')
"

# 5. Verify the generated incident details & multi-source evidence
echo ""
echo ">>> Inspecting generated correlated incident and multi-source evidence..."
kubectl exec -n "$NAMESPACE" "$CORR_POD" -- python3 -c "
import urllib.request, json

resp = urllib.request.urlopen('http://localhost:8001/incidents?incident_type=memory_failure&limit=1')
data = json.loads(resp.read().decode('utf-8'))
incidents = data.get('incidents', [])
if not incidents:
    print('✗ Error: Expected memory_failure incident was not found!')
    exit(1)

inc = incidents[0]
print(f'✓ Found Incident ID: {inc.get(\"id\")}')
print(f'✓ Title: {inc.get(\"title\")}')
print(f'✓ Service: {inc.get(\"service\")}')
print(f'✓ Severity: {inc.get(\"severity\")}')
print(f'✓ Status: {inc.get(\"status\")}')

evidence = inc.get('evidence', [])
sources = set(e.get('source') for e in evidence)
print(f'✓ Multi-Source Evidence Count: {len(evidence)}')
print(f'✓ Evidence Sources Correlated: {sorted(list(sources))}')

if len(sources) < 2:
    print('✗ Warning: Incident evidence should bridge multiple telemetry sources!')
else:
    print('✓ SUCCESS: Cross-domain correlation verified across multiple sources!')
"

# 6. Test Cooldown & Deduplication Suppression
echo ""
echo ">>> Testing Incident Cooldown & Deduplication (re-triggering within 600s window)..."
kubectl exec -n "$NAMESPACE" "$COLLECTOR_POD" -- python3 -c "
import urllib.request, json

dup_event = {
    'source': 'prometheus',
    'service': 'backend',
    'severity': 'critical',
    'data': {
        'metric': 'memory',
        'value_bytes': 205000000,
        'value_mib': 195.5,
        'limit_bytes': 209715200,
        'threshold_bytes': 188743680
    }
}
req = urllib.request.Request(
    'http://localhost:8000/events',
    data=json.dumps(dup_event).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
urllib.request.urlopen(req)
print('✓ Ingested duplicate spike event during active cooldown')
"

kubectl exec -n "$NAMESPACE" "$CORR_POD" -- python3 -c "
import urllib.request, json

req = urllib.request.Request('http://localhost:8001/correlate/now', data=b'', method='POST')
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode('utf-8'))
print('✓ Deduplication Check:')
print('   New Incidents (should be 0):', data.get('new_incidents_count'))
print('   Updated Incidents (under cooldown):', data.get('updated_incidents_count'))
assert data.get('new_incidents_count') == 0, 'Deduplication failed: created duplicate incident!'
print('✓ Deduplication successfully suppressed duplicate incident!')
"

# 7. Test Falco Security Correlation Rule
echo ""
echo ">>> Testing Runtime Security Correlation Rule (Falco alert)..."
kubectl exec -n "$NAMESPACE" "$COLLECTOR_POD" -- python3 -c "
import urllib.request, json

falco_payload = {
    'rule': 'Terminal shell in container',
    'priority': 'Notice',
    'output': 'A shell was spawned by user root in container backend',
    'output_fields': {
        'k8s.pod.name': 'backend-79f98444dc-sec'
    }
}
req = urllib.request.Request(
    'http://localhost:8000/events/falco',
    data=json.dumps(falco_payload).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
urllib.request.urlopen(req)
print('✓ Ingested Falco security webhook event')
"

kubectl exec -n "$NAMESPACE" "$CORR_POD" -- python3 -c "
import urllib.request, json

req = urllib.request.Request('http://localhost:8001/correlate/now', data=b'', method='POST')
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode('utf-8'))
print('✓ Falco Correlation Result:')
for inc in data.get('new_incidents', []):
    print(f'   -> [{inc.get(\"severity\").upper()}] {inc.get(\"incident_type\")}: {inc.get(\"title\")}')
"

# 8. Final Incident Summary
echo ""
echo "========================================================"
echo " SentinelOpsAI — Incident Summary Report"
echo "========================================================"
kubectl exec -n "$NAMESPACE" "$CORR_POD" -- python3 -c "
import urllib.request, json

resp = urllib.request.urlopen('http://localhost:8001/incidents/stats/summary')
stats = json.loads(resp.read().decode('utf-8'))
print(json.dumps(stats, indent=2))
"

echo ""
echo "✓ PHASE 8 (CROSS-DOMAIN CORRELATION ENGINE) VERIFICATION COMPLETE!"
