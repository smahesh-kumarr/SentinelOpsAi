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

# 2. Check and install Helm if missing
if ! command -v helm &> /dev/null; then
  echo ">>> Helm CLI not found. Installing Helm..."
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
  echo "✓ Helm installed successfully."
else
  echo "✓ Helm CLI is present: $(helm version --short)"
fi

# 3. Add and update Grafana Helm repository
echo ">>> Updating Grafana Helm repository..."
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# 4. Deploy Loki & Promtail via loki-stack
echo ">>> Installing/Upgrading loki-stack..."
helm upgrade --install loki grafana/loki-stack \
  --namespace "$NAMESPACE" \
  --values "$ROOT_DIR/k8s/logging/promtail-values.yaml"

# 5. Provision Loki as a DataSource in Grafana
echo ">>> Applying Grafana Loki DataSource ConfigMap..."
kubectl apply -f "$ROOT_DIR/k8s/logging/grafana-loki-datasource.yaml"

# 6. Wait for Loki and Promtail pods
echo "Waiting for Loki to be ready..."
kubectl rollout status statefulset/loki -n "$NAMESPACE" --timeout=120s 2>/dev/null || \
kubectl rollout status deployment/loki -n "$NAMESPACE" --timeout=120s 2>/dev/null || true

echo "Waiting for Promtail DaemonSet to be ready..."
kubectl rollout status daemonset/loki-promtail -n "$NAMESPACE" --timeout=120s 2>/dev/null || true

echo ""
echo "========================================================"
echo " Logging Stack Deployed Successfully!"
echo "========================================================"
kubectl get pods -n "$NAMESPACE" | grep -E "loki|promtail" || true
echo "========================================================"
echo ""
echo ">>> Verification in Grafana:"
echo "  1. Port-forward Grafana if not already running:"
echo "     kubectl port-forward svc/monitoring-grafana -n $NAMESPACE 3001:80 &"
echo ""
echo "  2. Open Grafana: http://localhost:3001"
echo "     -> Go to 'Explore' (Compass icon on the left menu)"
echo "     -> Select 'Loki' from the DataSource dropdown"
echo ""
echo "  3. Sample LogQL Queries to Run:"
echo "     - All SentinelOps logs:"
echo "       {namespace=\"$APP_NAMESPACE\"}"
echo ""
echo "     - Backend logs only:"
echo "       {app=\"backend\"}"
echo ""
echo "     - Filter structured JSON error logs (parsed by Promtail):"
echo "       {app=\"backend\"} | json | level=\"error\""
echo "========================================================"
