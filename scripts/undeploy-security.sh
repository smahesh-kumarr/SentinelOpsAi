#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Falco Security Teardown Script
# ==============================================================================
# Usage:
#   ./scripts/undeploy-security.sh
# ==============================================================================

set -e

NAMESPACE="falco"

echo "========================================================"
echo " SentinelOpsAI — Tearing Down Security Stack (Falco)"
echo " Namespace : $NAMESPACE"
echo "========================================================"

echo ">>> Uninstalling Helm release 'falco'..."
helm uninstall falco -n "$NAMESPACE" || true

echo ">>> Deleting '$NAMESPACE' namespace..."
kubectl delete namespace "$NAMESPACE" --ignore-not-found=true

echo "✓ Falco security stack completely uninstalled."
echo "========================================================"
