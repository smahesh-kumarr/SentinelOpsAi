#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Background Port-Forwarding Manager
# ==============================================================================
# Usage:
#   ./scripts/port-forward.sh start    # Start all background port-forwards
#   ./scripts/port-forward.sh stop     # Stop all background port-forwards
#   ./scripts/port-forward.sh status   # Check status of background tunnels
#   ./scripts/port-forward.sh restart  # Restart all background tunnels
# ==============================================================================

ACTION=${1:-"start"}
LOG_DIR="/tmp/sentinelops-ports"
PID_FILE="$LOG_DIR/pids"

# Detect primary host IP for convenient remote browser access
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
HOST_IP=${HOST_IP:-"127.0.0.1"}

mkdir -p "$LOG_DIR"

# Service definitions: Name | Namespace | K8s Target | Port Mapping | Endpoint/Credentials
SERVICES=(
  "frontend|sentinelopsai|svc/frontend|8080:80|Frontend UI & SRE Dock"
  "backend|sentinelopsai|svc/backend|3000:3000|Express API & /simulate"
  "grafana|monitoring|svc/monitoring-grafana|3001:80|Grafana (admin / prom-operator)"
  "prometheus|monitoring|svc/monitoring-kube-prometheus-prometheus|9090:9090|Prometheus Metrics UI"
  "falcosidekick|falco|svc/falco-falcosidekick-ui|2802:2802|Falco Security UI (admin / admin)"
  "collector|sentinelopsai|svc/collector-service|8000:8000|Telemetry Collector API"
  "correlation|sentinelopsai|svc/correlation-engine|8001:8001|Correlation Engine API"
  "ai-service|sentinelopsai|svc/ai-service|8002:8002|AI RCA & RAG API"
  "ai-agent|sentinelopsai|svc/ai-agent|8003:8003|Autonomous Remediation Agent API"
  "qdrant|sentinelopsai|svc/qdrant|6333:6333|Qdrant Vector DB Web Console"
)

stop_ports() {
  echo ">>> Stopping all active SentinelOpsAI background port-forwards..."
  if [ -f "$PID_FILE" ]; then
    while read -r pid name port; do
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
  # Clean up any orphan kubectl port-forwards for our mapped ports
  pkill -f "kubectl port-forward.*(8080|3000|3001|9090|2802|8000|8001|8002|8003|6333)" 2>/dev/null || true
  sleep 1
  echo "✓ All background port-forwards stopped."
}

start_ports() {
  stop_ports
  echo ""
  echo "=========================================================================="
  echo " SentinelOpsAI — Starting All Background Port-Forwards"
  echo " Binds To: 0.0.0.0 (Accessible via localhost and remote IP: $HOST_IP)"
  echo " Logs Dir: $LOG_DIR"
  echo "=========================================================================="
  echo ""

  touch "$PID_FILE"

  for entry in "${SERVICES[@]}"; do
    IFS="|" read -r name ns target port desc <<< "$entry"
    local_port=$(echo "$port" | cut -d':' -f1)

    # Launch in background bound to 0.0.0.0
    nohup kubectl port-forward --address 0.0.0.0 "$target" "$port" -n "$ns" > "$LOG_DIR/$name.log" 2>&1 &
    pid=$!
    echo "$pid $name $local_port" >> "$PID_FILE"
    echo "  [STARTED] $name (PID $pid) -> Port $local_port"
  done

  # Allow background processes to establish connections
  sleep 2

  echo ""
  echo "=========================================================================="
  echo " 🌐 SentinelOpsAI Live Services Dashboard"
  echo "=========================================================================="
  printf "%-16s | %-12s | %-32s | %s\n" "SERVICE" "LOCAL PORT" "URL (BROWSER ACCESS)" "DETAILS / CREDENTIALS"
  echo "----------------------------------------------------------------------------------------------------------"

  for entry in "${SERVICES[@]}"; do
    IFS="|" read -r name ns target port desc <<< "$entry"
    local_port=$(echo "$port" | cut -d':' -f1)
    
    # Check if PID is still alive
    if grep -q " $name " "$PID_FILE" 2>/dev/null; then
      pid=$(grep " $name " "$PID_FILE" | awk '{print $1}')
      if kill -0 "$pid" 2>/dev/null; then
        status_url="http://$HOST_IP:$local_port"
        printf "%-16s | %-12s | %-32s | %s\n" "$name" "$local_port" "$status_url" "$desc"
      else
        printf "%-16s | %-12s | %-32s | %s\n" "$name" "$local_port" "FAILED (Check $LOG_DIR/$name.log)" "$desc"
      fi
    fi
  done
  echo "=========================================================================="
  echo ""
  echo "💡 Tips:"
  echo "  - All tunnels run in the background. Your terminal is completely free!"
  echo "  - Check tunnel status:   ./scripts/port-forward.sh status"
  echo "  - Stop all tunnels:       ./scripts/port-forward.sh stop"
  echo "  - View specific log:      cat $LOG_DIR/<service>.log"
  echo ""
}

status_ports() {
  echo "=========================================================================="
  echo " SentinelOpsAI — Background Port-Forward Status"
  echo " Host IP: $HOST_IP"
  echo "=========================================================================="
  if [ ! -f "$PID_FILE" ]; then
    echo "No background port-forwards are currently recorded."
    exit 0
  fi

  printf "%-16s | %-8s | %-10s | %-32s\n" "SERVICE" "PORT" "STATUS" "ACCESS URL"
  echo "--------------------------------------------------------------------------"
  while read -r pid name port; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      printf "%-16s | %-8s | %-10s | %-32s\n" "$name" "$port" "RUNNING" "http://$HOST_IP:$port"
    else
      printf "%-16s | %-8s | %-10s | %-32s\n" "$name" "$port" "STOPPED" "(Check $LOG_DIR/$name.log)"
    fi
  done < "$PID_FILE"
  echo "=========================================================================="
}

case "$ACTION" in
  start)
    start_ports
    ;;
  stop)
    stop_ports
    ;;
  restart)
    stop_ports
    sleep 1
    start_ports
    ;;
  status)
    status_ports
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
