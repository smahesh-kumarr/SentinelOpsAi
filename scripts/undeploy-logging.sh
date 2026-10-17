#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Loki & Promtail Logging Teardown Script
# ==============================================================================
# Usage:
#   ./scripts/undeploy-logging.sh
# ==============================================================================

set -e

NAMESPACE="monitoring"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================================"
echo " SentinelOpsAI — Tearing Down Logging Stack (Loki)"
echo " Namespace : $NAMESPACE"
echo "========================================================"

echo ">>> Removing Grafana Loki DataSource ConfigMap..."
kubectl delete -f "$ROOT_DIR/k8s/logging/grafana-loki-datasource.yaml" --ignore-not-found=true

echo ">>> Uninstalling Helm release 'loki'..."
helm uninstall loki -n "$NAMESPACE" || true

echo "✓ Logging stack uninstalled successfully."
echo "========================================================"
