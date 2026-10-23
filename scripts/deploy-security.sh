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

# Clean up any broken pending release from a previous timed-out attempt
RELEASE_STATUS=$(helm status falco -n "$NAMESPACE" -o json 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || true)
if [ "$RELEASE_STATUS" == "pending-install" ] || [ "$RELEASE_STATUS" == "failed" ]; then
  echo ">>> Detected $RELEASE_STATUS release for falco. Cleaning up release state..."
  helm uninstall falco -n "$NAMESPACE" 2>/dev/null || true
  sleep 3
fi

# 4. Deploy Falco + Falcosidekick with retries and timeout
echo ">>> Installing/Upgrading Falco and Falcosidekick (extended timeout & auto-retry)..."
for attempt in 1 2 3; do
  echo ">>> Falco Helm install attempt $attempt of 3..."
  if helm upgrade --install falco falcosecurity/falco \
    --namespace "$NAMESPACE" \
    --create-namespace \
    --timeout 15m0s \
    --values "$ROOT_DIR/k8s/security/falco-values.yaml"; then
      echo "✓ Falco and Falcosidekick installed successfully."
      break
  else
    if [ "$attempt" -eq 3 ]; then
      echo "Error: Failed to install Falco after 3 attempts."
      exit 1
    fi
    echo "Warning: Attempt $attempt failed. Retrying in 10s..."
    helm uninstall falco -n "$NAMESPACE" 2>/dev/null || true
    sleep 10
  fi
done

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
