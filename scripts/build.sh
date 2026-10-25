#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Container Build & Push Automation (Linux/Docker)
# ==============================================================================
# Usage:
#   ./scripts/build.sh <dockerhub-username> [version-tag] [--push]
#
# Examples:
#   ./scripts/build.sh myusername v1
#   ./scripts/build.sh myusername v1 --push
# ==============================================================================

set -e

DOCKER_USER=${1:-"sentinelops"}
VERSION=${2:-"v1"}
PUSH_FLAG=${3:-""}

SERVICES=(
  "backend:backend"
  "frontend:frontend"
  "collector-service:collector-service"
  "correlation-engine:correlation-engine"
  "ai-service:ai-service"
  "ai-agent:ai-agent"
  "monitoring-backend:monitoring-app/backend"
  "monitoring-frontend:monitoring-app/frontend"
)

echo "========================================================"
echo " SentinelOpsAI — Building Docker Images"
echo " Registry User : $DOCKER_USER"
echo " Version Tag   : $VERSION"
echo "========================================================"

# Verify Docker engine is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker daemon is not running. Please start Docker."
  exit 1
fi

# Resolve project root directory (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

for entry in "${SERVICES[@]}"; do
  IFS=":" read -r svc svc_dir <<< "$entry"
  IMAGE_TAG="$DOCKER_USER/sentinelops-$svc:$VERSION"
  LATEST_TAG="$DOCKER_USER/sentinelops-$svc:latest"
  
  echo ""
  echo ">>> Building $svc ($IMAGE_TAG) from $svc_dir..."
  docker build -t "$IMAGE_TAG" -t "$LATEST_TAG" "$ROOT_DIR/$svc_dir"
  
  echo "✓ Successfully built $IMAGE_TAG"
done

echo ""
echo "========================================================"
echo " Image Summary:"
docker images | grep "sentinelops" || true
echo "========================================================"

# Push to registry if requested
if [ "$PUSH_FLAG" == "--push" ] || [ "$3" == "-p" ]; then
  echo ""
  echo ">>> Pushing images to DockerHub..."
  for entry in "${SERVICES[@]}"; do
    IFS=":" read -r svc svc_dir <<< "$entry"
    docker push "$DOCKER_USER/sentinelops-$svc:$VERSION"
    docker push "$DOCKER_USER/sentinelops-$svc:latest"
  done
  echo "✓ All images pushed to DockerHub successfully!"
else
  echo ""
  echo "Notice: Images built locally. To push to DockerHub, run:"
  echo "  ./scripts/build.sh $DOCKER_USER $VERSION --push"
fi
