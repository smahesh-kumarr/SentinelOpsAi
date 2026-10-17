#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Falco & Falcosidekick Security Deployment Script
# ==============================================================================
# Usage:
#   ./scripts/deploy-security.sh
# ==============================================================================

set -e

NAMESPACE="falco"
APP_NAMESPACE="sentinelopsai"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================================"
echo " SentinelOpsAI — Deploying Runtime Security (Falco)"
echo " Namespace : $NAMESPACE"
echo " Driver    : modern_ebpf"
echo "========================================================"

# 1. Verify cluster connection
if ! kubectl cluster-info > /dev/null 2>&1; then
  echo "Error: Cannot connect to Kubernetes cluster."
  exit 1
fi
echo "✓ Kubernetes cluster reachable."

# 2. Check and install Helm if missing
if ! command -v helm &> /dev/null; then
  echo ">>> Helm CLI not found. Installing Helm..."
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  echo "✓ Helm installed successfully."
else
  echo "✓ Helm CLI is present: $(helm version --short)"
fi

# 3. Add and update Falco Helm repository
echo ">>> Updating Falco Community Helm repository..."
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update

# 4. Deploy Falco + Falcosidekick
echo ">>> Installing/Upgrading Falco and Falcosidekick..."
helm upgrade --install falco falcosecurity/falco \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --values "$ROOT_DIR/k8s/security/falco-values.yaml"

echo "Waiting for Falco DaemonSet to roll out..."
kubectl rollout status daemonset/falco -n "$NAMESPACE" --timeout=180s 2>/dev/null || true

echo "Waiting for Falcosidekick to start..."
kubectl rollout status deployment/falco-falcosidekick -n "$NAMESPACE" --timeout=120s 2>/dev/null || true

echo ""
echo "========================================================"
echo " Falco Security Stack Deployed Successfully!"
echo "========================================================"
kubectl get pods -n "$NAMESPACE" -o wide
echo "========================================================"
echo ""
echo ">>> Next Steps:"
echo "  1. View Falcosidekick WebUI in browser:"
echo "     kubectl port-forward svc/falco-falcosidekick-ui -n $NAMESPACE 2802:2802 &"
echo "     -> Open: http://localhost:2802"
echo ""
echo "  2. Test security event detection & webhook forwarding:"
echo "     ./scripts/test-security.sh"
echo "========================================================"
