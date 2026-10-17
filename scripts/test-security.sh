#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Security Threat Simulation & Verification Script
# ==============================================================================
# Usage:
#   ./scripts/test-security.sh
# ==============================================================================

set -e

APP_NAMESPACE="sentinelopsai"
FALCO_NAMESPACE="falco"

echo "========================================================"
echo " SentinelOpsAI — Security Event Simulation Test"
echo "========================================================"

# 1. Find a running backend pod
BACKEND_POD=$(kubectl get pod -l app=backend -n "$APP_NAMESPACE" -o jsonpath="{.items[0].metadata.name}" 2>/dev/null || true)

if [ -z "$BACKEND_POD" ]; then
  echo "Error: No backend pod found in namespace '$APP_NAMESPACE'."
  echo "Ensure the application is deployed first via ./scripts/deploy-k8s.sh."
  exit 1
fi

echo "Target Pod: $BACKEND_POD in namespace $APP_NAMESPACE"
echo ""

# 2. Trigger unauthorized sensitive file read (/etc/shadow)
echo ">>> Triggering unauthorized access: 'cat /etc/shadow' inside $BACKEND_POD..."
kubectl exec "$BACKEND_POD" -n "$APP_NAMESPACE" -- sh -c "cat /etc/shadow" > /dev/null 2>&1 || true

echo "✓ Action executed. Waiting 3 seconds for eBPF detection & webhook delivery..."
sleep 3
echo ""

# 3. Check Falco Detection
echo "========================================================"
echo " 1. Falco Detection Log (Kernel-level eBPF):"
echo "========================================================"
kubectl logs -n "$FALCO_NAMESPACE" -l app.kubernetes.io/name=falco --tail=20 | grep -iE "shadow|sensitive|notice" || \
kubectl logs -n "$FALCO_NAMESPACE" -l app.kubernetes.io/name=falco --tail=10

echo ""
echo "========================================================"
echo " 2. Falcosidekick Webhook Forwarding Log:"
echo "========================================================"
kubectl logs -n "$FALCO_NAMESPACE" -l app.kubernetes.io/name=falcosidekick --tail=15 | grep -i "webhook" || \
kubectl logs -n "$FALCO_NAMESPACE" -l app.kubernetes.io/name=falcosidekick --tail=10

echo ""
echo "========================================================"
echo " 3. Collector Service Received Alert Log:"
echo "========================================================"
kubectl logs -n "$APP_NAMESPACE" -l app=collector-service --tail=15 | grep -i "falco" || \
kubectl logs -n "$APP_NAMESPACE" -l app=collector-service --tail=10

echo "========================================================"
echo " Security Pipeline Verification Complete!"
echo "========================================================"
