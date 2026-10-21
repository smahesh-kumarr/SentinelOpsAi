#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Telemetry Collector Service Verification Script
# ==============================================================================
# Usage:
#   ./scripts/test-collector.sh
# ==============================================================================

set -e

NAMESPACE="sentinelopsai"

echo "========================================================"
echo " SentinelOpsAI — Testing Telemetry Collector Service"
echo " Namespace : $NAMESPACE"
echo "========================================================"

COLLECTOR_POD=$(kubectl get pod -l app=collector-service -n "$NAMESPACE" -o jsonpath="{.items[0].metadata.name}" 2>/dev/null || true)

if [ -z "$COLLECTOR_POD" ]; then
  echo "Error: Collector pod not found in namespace '$NAMESPACE'."
  exit 1
fi

echo "Collector Pod: $COLLECTOR_POD"
echo ""

# 1. Health Probe Check
echo ">>> 1. Checking Collector Health (/health)..."
HEALTH_JSON=$(kubectl exec "$COLLECTOR_POD" -n "$NAMESPACE" -- python3 -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health').read().decode())")
echo "$HEALTH_JSON"

# 2. Trigger On-Demand Polling
echo ""
echo ">>> 2. Triggering immediate manual polling (/poll/now)..."
POLL_JSON=$(kubectl exec "$COLLECTOR_POD" -n "$NAMESPACE" -- python3 -c "import urllib.request; req = urllib.request.Request('http://localhost:8000/poll/now', method='POST'); print(urllib.request.urlopen(req).read().decode())")
echo "$POLL_JSON"

# 3. Retrieve Ingested Events
echo ""
echo ">>> 3. Fetching recently ingested events (/events)..."
EVENTS_JSON=$(kubectl exec "$COLLECTOR_POD" -n "$NAMESPACE" -- python3 -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/events?limit=10').read().decode())")
echo "$EVENTS_JSON"

echo ""
echo "========================================================"
echo " Collector Service Verification Complete!"
echo "========================================================"
