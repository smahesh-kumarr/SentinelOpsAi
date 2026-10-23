#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Prometheus & Grafana Monitoring Deployment Script
# ==============================================================================
# Usage:
#   ./scripts/deploy-monitoring.sh
# ==============================================================================

set -e

NAMESPACE="monitoring"
APP_NAMESPACE="sentinelopsai"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================================"
echo " SentinelOpsAI — Deploying Monitoring Stack"
echo " Monitoring NS  : $NAMESPACE"
echo " Application NS : $APP_NAMESPACE"
echo "========================================================"

# 1. Verify cluster connection
if ! kubectl cluster-info > /dev/null 2>&1; then
  echo "Error: Cannot connect to Kubernetes cluster."
  exit 1
fi
echo "✓ Kubernetes cluster reachable."

# 2. Check if monitoring is already running and healthy (Skip redundant download)
if kubectl get deployment monitoring-grafana -n "$NAMESPACE" &>/dev/null && \
   kubectl get deployment monitoring-kube-prometheus-operator -n "$NAMESPACE" &>/dev/null; then
  if kubectl rollout status deployment/monitoring-grafana -n "$NAMESPACE" --timeout=5s &>/dev/null; then
    echo "✓ Monitoring stack (Prometheus & Grafana) is ALREADY running and healthy in '$NAMESPACE'!"
    echo ">>> Ensuring ServiceMonitor and custom Dashboard are applied..."
    kubectl apply -f "$ROOT_DIR/k8s/monitoring/backend-servicemonitor.yaml"
    kubectl apply -f "$ROOT_DIR/k8s/monitoring/sentinelops-grafana-dashboard.yaml"
    
    GRAFANA_PW=$(kubectl get secret monitoring-grafana -n "$NAMESPACE" -o jsonpath="{.data.admin-password}" 2>/dev/null | base64 -d || echo "prom-operator")
    echo ""
    echo "========================================================"
    echo " Prometheus & Grafana are live!"
    echo " Grafana UI   : http://localhost:3001"
    echo " Credentials  : admin / $GRAFANA_PW"
    echo " Prometheus UI: http://localhost:9090"
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

# 4. Add and update Prometheus community helm repo
echo ">>> Updating Prometheus Community Helm repository..."
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>/dev/null || true
helm repo update || true

# Clean up any broken pending release from a previous timed-out attempt
RELEASE_STATUS=$(helm status monitoring -n "$NAMESPACE" -o json 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || true)
if [ "$RELEASE_STATUS" == "pending-install" ] || [ "$RELEASE_STATUS" == "failed" ]; then
  echo ">>> Detected $RELEASE_STATUS release from earlier timeout. Cleaning up release state..."
  helm uninstall monitoring -n "$NAMESPACE" 2>/dev/null || true
  sleep 3
fi

# 5. Download chart locally to eliminate Helm HTTP header timeouts on GitHub release assets
CHART_CACHE_DIR="/tmp/sentinelops-charts"
mkdir -p "$CHART_CACHE_DIR"
CHART_FILE="$CHART_CACHE_DIR/kube-prometheus-stack.tgz"

if [ ! -s "$CHART_FILE" ]; then
  echo ">>> Downloading kube-prometheus-stack chart archive via curl (forcing IPv4 & retries)..."
  CHART_URL="https://github.com/prometheus-community/helm-charts/releases/download/kube-prometheus-stack-92.11.0/kube-prometheus-stack-92.11.0.tgz"
  if ! curl -4 -fL --connect-timeout 30 --retry 5 --retry-delay 2 "$CHART_URL" -o "$CHART_FILE"; then
    echo "Warning: Direct curl download failed. Attempting helm pull..."
    helm pull prometheus-community/kube-prometheus-stack --destination "$CHART_CACHE_DIR"
    CHART_FILE=$(ls -t "$CHART_CACHE_DIR"/kube-prometheus-stack-*.tgz 2>/dev/null | head -n 1)
  fi
fi

# 6. Install / upgrade from local chart file
echo ">>> Installing kube-prometheus-stack from local archive: $CHART_FILE"
helm upgrade --install monitoring "$CHART_FILE" \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --timeout 15m0s \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set grafana.sidecar.dashboards.enabled=true \
  --set grafana.sidecar.dashboards.searchNamespace=ALL

echo "Waiting for Prometheus Operator to start..."
kubectl rollout status deployment/monitoring-kube-prometheus-operator -n "$NAMESPACE" --timeout=120s

echo "Waiting for Grafana to start..."
kubectl rollout status deployment/monitoring-grafana -n "$NAMESPACE" --timeout=120s

# 6. Apply SentinelOps ServiceMonitor and custom Dashboard
echo ">>> Applying backend ServiceMonitor..."
kubectl apply -f "$ROOT_DIR/k8s/monitoring/backend-servicemonitor.yaml"

echo ">>> Applying SentinelOps custom Grafana dashboard..."
kubectl apply -f "$ROOT_DIR/k8s/monitoring/sentinelops-grafana-dashboard.yaml"

# 7. Retrieve Grafana credentials
GRAFANA_PW=$(kubectl get secret monitoring-grafana -n "$NAMESPACE" -o jsonpath="{.data.admin-password}" 2>/dev/null | base64 -d || echo "prom-operator")

echo ""
echo "========================================================"
echo " Prometheus & Grafana Deployed Successfully!"
echo " Namespace     : $NAMESPACE"
echo " Grafana UI    : http://localhost:3001"
echo " Credentials   : admin / $GRAFANA_PW"
echo " Prometheus UI : http://localhost:9090"
echo "========================================================"
