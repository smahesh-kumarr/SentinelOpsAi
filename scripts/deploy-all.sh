#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Master Deployment & Port Orchestration Script
# ==============================================================================
# Deploys the entire end-to-end platform in the correct dependency order:
#   1. Prometheus & Grafana Monitoring Stack
#   2. Loki & Promtail Centralized Logging Stack
#   3. Falco & Falcosidekick Runtime Security Stack
#   4. MongoDB & App Services (Backend, Frontend)
#   5. Telemetry Collector Service
#   6. Cross-Domain Correlation Engine
#   7. Qdrant Vector Database
#   8. AI Root Cause Analysis & RAG Service
#   9. Autonomous Remediation AI Agent
#  10. Background Port-Forwarding (Exposes all ports in background)
# ==============================================================================
# Usage:
#   ./scripts/deploy-all.sh                  # Full rollout with background ports
#   ./scripts/deploy-all.sh --no-ports      # Rollout without starting port-forwards
# ==============================================================================

set -e

PORT_FORWARD_FLAG=${1:-""}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================================================="
echo " 🛡️ SentinelOpsAI — Master Automated Deployment Pipeline"
echo "=========================================================================="

# 1. Verify cluster connection
if ! kubectl cluster-info > /dev/null 2>&1; then
  echo "Error: Cannot connect to Kubernetes cluster."
  echo "Ensure your Kubernetes cluster (k3s, kubeadm, or kind) is running."
  exit 1
fi
echo "✓ Kubernetes cluster is active and reachable."

# Pre-create all required namespaces
echo ">>> Ensuring cluster namespaces exist..."
kubectl create namespace sentinelopsai --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl create namespace falco --dry-run=client -o yaml | kubectl apply -f - >/dev/null
echo "✓ Namespaces verified: sentinelopsai, monitoring, falco."

# 2. Deploy Monitoring Stack (Prometheus & Grafana)
echo ""
echo "=========================================================================="
echo " [1/4] Deploying Monitoring Stack (Prometheus & Grafana)..."
echo "=========================================================================="
chmod +x "$SCRIPT_DIR/deploy-monitoring.sh"
"$SCRIPT_DIR/deploy-monitoring.sh"

# 3. Deploy Logging Stack (Loki & Promtail)
echo ""
echo "=========================================================================="
echo " [2/4] Deploying Logging Stack (Loki & Promtail)..."
echo "=========================================================================="
chmod +x "$SCRIPT_DIR/deploy-logging.sh"
"$SCRIPT_DIR/deploy-logging.sh"

# 4. Deploy Runtime Security Stack (Falco & Falcosidekick)
echo ""
echo "=========================================================================="
echo " [3/4] Deploying Runtime Security Stack (Falco & Falcosidekick)..."
echo "=========================================================================="
chmod +x "$SCRIPT_DIR/deploy-security.sh"
"$SCRIPT_DIR/deploy-security.sh"

# 5. Deploy App, Collector, Correlation, RAG & AI Agent
echo ""
echo "=========================================================================="
echo " [4/4] Deploying App, Collector, Correlation, Vector DB & AI Services..."
echo "=========================================================================="
chmod +x "$SCRIPT_DIR/deploy-k8s.sh"
"$SCRIPT_DIR/deploy-k8s.sh"

# 6. Overall Cluster Pod Health Summary
echo ""
echo "=========================================================================="
echo " 📊 Overall Cluster Health Status"
echo "=========================================================================="
echo ">>> Namespace: sentinelopsai"
kubectl get pods -n sentinelopsai
echo ""
echo ">>> Namespace: monitoring"
kubectl get pods -n monitoring
echo ""
echo ">>> Namespace: falco"
kubectl get pods -n falco

# 7. Start Background Port-Forwards
if [ "$PORT_FORWARD_FLAG" != "--no-ports" ]; then
  echo ""
  chmod +x "$SCRIPT_DIR/port-forward.sh"
  "$SCRIPT_DIR/port-forward.sh" start
else
  echo ""
  echo "Notice: Port-forwarding was skipped (--no-ports specified)."
  echo "To launch all background port-forwards later, run:"
  echo "  ./scripts/port-forward.sh start"
fi

echo ""
echo "=========================================================================="
echo " 🎉 ALL SENTINELOPSAI COMPONENTS SUCCESSFULLY DEPLOYED & ACTIVE!"
echo "=========================================================================="
