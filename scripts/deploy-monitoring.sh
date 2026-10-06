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

# 2. Check and install Helm if missing
if ! command -v helm &> /dev/null; then
  echo ">>> Helm CLI not found. Installing Helm..."
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  echo "✓ Helm installed successfully."
else
  echo "✓ Helm CLI is present: $(helm version --short)"
fi

# 3. Add and update Prometheus community helm repo
echo ">>> Updating Prometheus Community Helm repository..."
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 4. Install / upgrade kube-prometheus-stack
echo ">>> Installing kube-prometheus-stack via Helm..."
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set grafana.sidecar.dashboards.enabled=true \
  --set grafana.sidecar.dashboards.searchNamespace=ALL

echo "Waiting for Prometheus Operator to start..."
kubectl rollout status deployment/monitoring-kube-prometheus-operator -n "$NAMESPACE" --timeout=120s

echo "Waiting for Grafana to start..."
kubectl rollout status deployment/monitoring-grafana -n "$NAMESPACE" --timeout=120s

# 5. Apply SentinelOps ServiceMonitor and custom Dashboard
echo ">>> Applying backend ServiceMonitor..."
kubectl apply -f "$ROOT_DIR/k8s/monitoring/backend-servicemonitor.yaml"

echo ">>> Applying SentinelOps custom Grafana dashboard..."
kubectl apply -f "$ROOT_DIR/k8s/monitoring/sentinelops-grafana-dashboard.yaml"

# 6. Retrieve Grafana credentials
GRAFANA_PW=$(kubectl get secret monitoring-grafana -n "$NAMESPACE" -o jsonpath="{.data.admin-password}" | base64 -d)

echo ""
echo "========================================================"
echo " Monitoring Stack Deployed Successfully!"
echo "========================================================"
echo " Grafana Credentials:"
echo "   Username : admin"
echo "   Password : $GRAFANA_PW"
echo "========================================================"
echo ""
echo ">>> Access Commands:"
echo ""
echo "  1. Grafana Dashboard:"
echo "     kubectl port-forward svc/monitoring-grafana -n $NAMESPACE 3001:80"
echo "     -> Open: http://localhost:3001"
echo "     -> Preloaded dashboard: 'SentinelOpsAI — SRE Observability Dashboard'"
echo ""
echo "  2. Prometheus Web UI:"
echo "     kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n $NAMESPACE 9090:9090"
echo "     -> Open: http://localhost:9090/targets (Verify backend-monitor is UP)"
echo ""
echo "  3. Alertmanager UI:"
echo "     kubectl port-forward svc/monitoring-kube-prometheus-alertmanager -n $NAMESPACE 9093:9093"
echo "     -> Open: http://localhost:9093"
echo "========================================================"
