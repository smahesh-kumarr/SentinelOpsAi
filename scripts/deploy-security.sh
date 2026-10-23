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

# Ensure namespaces exist
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl create namespace "$APP_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# 2. Check if Falco is already running and healthy (Skip redundant download)
if kubectl get daemonset falco -n "$NAMESPACE" &>/dev/null && \
   kubectl get deployment falco-falcosidekick -n "$NAMESPACE" &>/dev/null; then
  FALCO_READY=$(kubectl get daemonset falco -n "$NAMESPACE" -o jsonpath='{.status.numberReady}' 2>/dev/null || echo "0")
  if [ "$FALCO_READY" -gt 0 ]; then
    echo "✓ Runtime Security (Falco & Falcosidekick) is ALREADY running and healthy in '$NAMESPACE'!"
    echo "========================================================"
    exit 0
  fi
fi

# 3. Check and install Helm if missing
if ! command -v helm &> /dev/null; then
  echo ">>> Helm CLI not found. Installing Helm..."
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  echo "✓ Helm installed successfully."
else
  echo "✓ Helm CLI is present: $(helm version --short)"
fi

# 4. Add and update Falco Helm repository
echo ">>> Updating Falco Community Helm repository..."
helm repo add falcosecurity https://falcosecurity.github.io/charts 2>/dev/null || true
helm repo update || true

# Clean up any broken pending release from a previous timed-out attempt
RELEASE_STATUS=$(helm status falco -n "$NAMESPACE" -o json 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || true)
if [ "$RELEASE_STATUS" == "pending-install" ] || [ "$RELEASE_STATUS" == "failed" ]; then
  echo ">>> Detected $RELEASE_STATUS release for falco. Cleaning up release state..."
  helm uninstall falco -n "$NAMESPACE" 2>/dev/null || true
  sleep 3
fi

# 5. Download falco chart locally to prevent Helm HTTP header timeouts
CHART_CACHE_DIR="/tmp/sentinelops-charts"
mkdir -p "$CHART_CACHE_DIR"
CHART_FILE="$CHART_CACHE_DIR/falco.tgz"

if [ ! -s "$CHART_FILE" ]; then
  echo ">>> Downloading falco chart archive via curl (forcing IPv4 & retries)..."
  CHART_URL="https://github.com/falcosecurity/charts/releases/download/falco-9.2.1/falco-9.2.1.tgz"
  if ! curl -4 -fL --connect-timeout 30 --retry 5 --retry-delay 2 "$CHART_URL" -o "$CHART_FILE"; then
    echo "Warning: Direct curl download failed. Attempting helm pull..."
    helm pull falcosecurity/falco --destination "$CHART_CACHE_DIR"
    CHART_FILE=$(ls -t "$CHART_CACHE_DIR"/falco-*.tgz 2>/dev/null | head -n 1)
  fi
fi

echo ">>> Installing falco from local archive: $CHART_FILE"
helm upgrade --install falco "$CHART_FILE" \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --timeout 15m0s \
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
