#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Prometheus & Grafana Monitoring Teardown Script
# ==============================================================================
# Usage:
#   ./scripts/undeploy-monitoring.sh
# ==============================================================================

set -e

NAMESPACE="monitoring"
APP_NAMESPACE="sentinelopsai"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================================"
echo " SentinelOpsAI — Tearing Down Monitoring Stack"
echo "========================================================"

echo ">>> Removing backend ServiceMonitor..."
kubectl delete -f "$ROOT_DIR/k8s/monitoring/backend-servicemonitor.yaml" --ignore-not-found=true

echo ">>> Uninstalling Helm release 'monitoring'..."
helm uninstall monitoring -n "$NAMESPACE" || true

echo ">>> Deleting '$NAMESPACE' namespace..."
kubectl delete namespace "$NAMESPACE" --ignore-not-found=true

echo "✓ Monitoring stack completely removed!"
echo "========================================================"
