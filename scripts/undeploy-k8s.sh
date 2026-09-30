#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Kubernetes Teardown / Cleanup Script
# ==============================================================================
# Usage:
#   ./scripts/undeploy-k8s.sh                 # Deletes all resources & the namespace
#   ./scripts/undeploy-k8s.sh --keep-ns      # Deletes workloads but keeps namespace
# ==============================================================================

set -e

NAMESPACE="sentinelopsai"
MODE=${1:-""}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================================"
echo " SentinelOpsAI — Teardown & Resource Cleanup"
echo " Target Namespace : $NAMESPACE"
echo "========================================================"

if ! kubectl cluster-info > /dev/null 2>&1; then
  echo "Error: Cannot connect to Kubernetes cluster."
  exit 1
fi

if [ "$MODE" == "--keep-ns" ]; then
  echo ">>> Deleting Collector Service..."
  kubectl delete -f "$ROOT_DIR/k8s/collector/" --ignore-not-found=true

  echo ">>> Deleting Frontend..."
  kubectl delete -f "$ROOT_DIR/k8s/frontend/" --ignore-not-found=true

  echo ">>> Deleting Backend..."
  kubectl delete -f "$ROOT_DIR/k8s/backend/" --ignore-not-found=true

  echo ">>> Deleting Backend Secret..."
  kubectl delete secret backend-secrets -n "$NAMESPACE" --ignore-not-found=true

  echo ">>> Deleting MongoDB..."
  kubectl delete -f "$ROOT_DIR/k8s/mongodb/" --ignore-not-found=true

  echo "✓ Workloads deleted. Namespace '$NAMESPACE' preserved."
else
  echo ">>> Deleting entire '$NAMESPACE' namespace (and all contained resources)..."
  kubectl delete namespace "$NAMESPACE" --ignore-not-found=true
  echo "✓ Namespace '$NAMESPACE' and all resources have been completely removed!"
fi

echo "========================================================"
