#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Container Image Vulnerability Scanning (Trivy)
# ==============================================================================
# Usage:
#   ./scripts/scan-images.sh [dockerhub-username]
# ==============================================================================

set -e

DOCKER_USER=${1:-"maheshkumars772"}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORTS_DIR="$ROOT_DIR/reports"

mkdir -p "$REPORTS_DIR"

echo "========================================================"
echo " SentinelOpsAI — Scanning Container Images with Trivy"
echo " Registry User : $DOCKER_USER"
echo " Reports Dir   : $REPORTS_DIR"
echo "========================================================"

# Check and install Trivy if missing
if ! command -v trivy &> /dev/null; then
  echo ">>> Trivy not found. Installing Trivy..."
  sudo apt-get update -y
  sudo apt-get install -y wget apt-transport-https gnupg lsb-release
  wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo gpg --dearmor -o /usr/share/keyrings/trivy.gpg
  echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
  sudo apt-get update -y
  sudo apt-get install -y trivy
  echo "✓ Trivy installed successfully."
else
  echo "✓ Trivy is installed: $(trivy --version | head -n 1)"
fi

IMAGES=(
  "$DOCKER_USER/sentinelops-backend:v1"
  "$DOCKER_USER/sentinelops-frontend:v1"
  "$DOCKER_USER/sentinelops-collector-service:v1"
)

for img in "${IMAGES[@]}"; do
  SVC_NAME=$(echo "$img" | cut -d'/' -f2 | cut -d':' -f1)
  REPORT_JSON="$REPORTS_DIR/${SVC_NAME}-trivy.json"

  echo ""
  echo ">>> Scanning $img..."
  trivy image --severity HIGH,CRITICAL "$img" || true
  trivy image --format json --output "$REPORT_JSON" "$img" || true
  echo "✓ Report saved to $REPORT_JSON"
done

echo ""
echo "========================================================"
echo " Trivy Scans Completed! Summary reports generated in:"
echo "   $REPORTS_DIR/"
echo "========================================================"
