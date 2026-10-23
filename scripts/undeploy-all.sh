#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Master Teardown & Port Cleanup Script
# ==============================================================================
# Cleans up all background port-forwards and uninstalls all stacks:
#   1. Stops all background port-forward tunnels
#   2. Uninstalls App, Collector, AI Services (sentinelopsai namespace)
#   3. Uninstalls Falco & Falcosidekick (falco namespace)
#   4. Uninstalls Loki & Promtail (monitoring namespace)
#   5. Uninstalls Prometheus & Grafana (monitoring namespace)
# ==============================================================================
# Usage:
#   ./scripts/undeploy-all.sh
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================================================="
echo " 🧹 SentinelOpsAI — Master Teardown & Resource Cleanup"
echo "=========================================================================="

# 1. Stop background port-forwards first
chmod +x "$SCRIPT_DIR/port-forward.sh"
"$SCRIPT_DIR/port-forward.sh" stop

# 2. Undeploy App & AI services
echo ""
echo ">>> [1/4] Tearing down sentinelopsai workloads..."
chmod +x "$SCRIPT_DIR/undeploy-k8s.sh"
"$SCRIPT_DIR/undeploy-k8s.sh" || true

# 3. Undeploy Security (Falco)
echo ""
echo ">>> [2/4] Tearing down Falco Security stack..."
chmod +x "$SCRIPT_DIR/undeploy-security.sh"
"$SCRIPT_DIR/undeploy-security.sh" || true

# 4. Undeploy Logging (Loki/Promtail)
echo ""
echo ">>> [3/4] Tearing down Loki logging stack..."
chmod +x "$SCRIPT_DIR/undeploy-logging.sh"
"$SCRIPT_DIR/undeploy-logging.sh" || true

# 5. Undeploy Monitoring (Prometheus/Grafana)
echo ""
echo ">>> [4/4] Tearing down Prometheus & Grafana monitoring stack..."
chmod +x "$SCRIPT_DIR/undeploy-monitoring.sh"
"$SCRIPT_DIR/undeploy-monitoring.sh" || true

echo ""
echo "=========================================================================="
echo " ✓ ALL SENTINELOPSAI COMPONENTS & PORT-FORWARDS HAVE BEEN REMOVED!"
echo "=========================================================================="
