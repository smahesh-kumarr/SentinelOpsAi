#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Loki & Promtail Logging Deployment Script
# ==============================================================================
# Usage:
#   ./scripts/deploy-logging.sh
# ==============================================================================

set -e

NAMESPACE="monitoring"
APP_NAMESPACE="sentinelopsai"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================================"
echo " SentinelOpsAI — Deploying Centralized Logging (Loki)"
echo " Namespace : $NAMESPACE"
echo "========================================================"

# 1. Verify cluster connection
if ! kubectl cluster-info > /dev/null 2>&1; then
  echo "Error: Cannot connect to Kubernetes cluster."
  exit 1
fi
echo "✓ Kubernetes cluster reachable."

# 2. Check if Loki & Promtail are already running and healthy
if kubectl get daemonset loki-promtail -n "$NAMESPACE" &>/dev/null; then
  LOKI_POD_STATUS=$(kubectl get pods -n "$NAMESPACE" -l app=loki -o jsonpath='{.items[0].status.phase}' 2>/dev/null || true)
  if [ "$LOKI_POD_STATUS" == "Running" ]; then
    echo "✓ Logging stack (Loki & Promtail) is ALREADY running and healthy in '$NAMESPACE'!"
    echo ">>> Ensuring Grafana Loki DataSource ConfigMap is applied..."
    kubectl apply -f "$ROOT_DIR/k8s/logging/grafana-loki-datasource.yaml"
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

# 4. Add and update Grafana Helm repository
echo ">>> Updating Grafana Helm repository..."
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update || true

# Clean up any broken pending release from a previous timed-out attempt
RELEASE_STATUS=$(helm status loki -n "$NAMESPACE" -o json 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || true)
if [ "$RELEASE_STATUS" == "pending-install" ] || [ "$RELEASE_STATUS" == "failed" ]; then
  echo ">>> Detected $RELEASE_STATUS release for loki. Cleaning up release state..."
  helm uninstall loki -n "$NAMESPACE" 2>/dev/null || true
  sleep 3
fi

# 5. Download loki-stack chart locally to prevent Helm HTTP header timeouts
CHART_CACHE_DIR="/tmp/sentinelops-charts"
mkdir -p "$CHART_CACHE_DIR"
CHART_FILE="$CHART_CACHE_DIR/loki-stack.tgz"

if [ ! -s "$CHART_FILE" ]; then
  echo ">>> Downloading loki-stack chart archive via curl (forcing IPv4 & retries)..."
  CHART_URL="https://github.com/grafana/helm-charts/releases/download/loki-stack-2.10.3/loki-stack-2.10.3.tgz"
  if ! curl -4 -fL --connect-timeout 30 --retry 5 --retry-delay 2 "$CHART_URL" -o "$CHART_FILE"; then
    echo "Warning: Direct curl download failed. Attempting helm pull..."
    helm pull grafana/loki-stack --destination "$CHART_CACHE_DIR"
    CHART_FILE=$(ls -t "$CHART_CACHE_DIR"/loki-stack-*.tgz 2>/dev/null | head -n 1)
  fi
fi

echo ">>> Installing loki-stack from local archive: $CHART_FILE"
helm upgrade --install loki "$CHART_FILE" \
  --namespace "$NAMESPACE" \
  --timeout 15m0s \
  --values "$ROOT_DIR/k8s/logging/promtail-values.yaml"

# 6. Provision Loki as a DataSource in Grafana
echo ">>> Applying Grafana Loki DataSource ConfigMap..."
kubectl apply -f "$ROOT_DIR/k8s/logging/grafana-loki-datasource.yaml"

# 7. Wait for Loki and Promtail pods
echo "Waiting for Loki to be ready..."
kubectl rollout status statefulset/loki -n "$NAMESPACE" --timeout=120s 2>/dev/null || \
kubectl rollout status deployment/loki -n "$NAMESPACE" --timeout=120s 2>/dev/null || true

echo "Waiting for Promtail DaemonSet to be ready..."
kubectl rollout status daemonset/loki-promtail -n "$NAMESPACE" --timeout=120s 2>/dev/null || true

echo ""
echo "========================================================"
echo " Centralized Logging Stack Deployed Successfully!"
echo " Namespace    : $NAMESPACE"
echo " Loki Endpoint: http://loki.$NAMESPACE.svc.cluster.local:3100"
echo " DataSource   : Auto-provisioned in Grafana via ConfigMap"
echo "========================================================"
