#!/bin/bash
# ==============================================================================
# SentinelOpsAI — Kubernetes Automated Rollout Script
# ==============================================================================
# Usage:
#   ./scripts/deploy-k8s.sh [dockerhub-username]
# ==============================================================================

set -e

DOCKER_USER=${1:-"maheshkumars772"}
NAMESPACE="sentinelopsai"

# Resolve repo root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================================"
echo " SentinelOpsAI — Deploying to Kubernetes"
echo " Namespace     : $NAMESPACE"
echo " Registry User : $DOCKER_USER"
echo "========================================================"

# 1. Verify cluster connection
if ! kubectl cluster-info > /dev/null 2>&1; then
  echo "Error: Cannot connect to Kubernetes cluster."
  echo "Make sure your cluster (kind, k3s, or minikube) is running."
  exit 1
fi

echo "✓ Kubernetes cluster reachable."

# 2. Create namespace if not exists
echo ">>> Applying namespace..."
kubectl apply -f "$ROOT_DIR/k8s/00-namespace.yaml"

# 3. Create or update backend secrets idempotently
echo ">>> Configuring backend secrets..."
kubectl create secret generic backend-secrets \
  --namespace="$NAMESPACE" \
  --from-literal=MONGODB_URI="mongodb://mongodb.$NAMESPACE.svc.cluster.local:27017/sentinelops" \
  --from-literal=JWT_SECRET="sentinelops-super-secret-jwt-key" \
  --dry-run=client -o yaml | kubectl apply -f -

# 4. Apply backend ConfigMap
echo ">>> Applying backend ConfigMap..."
kubectl apply -f "$ROOT_DIR/k8s/backend/backend-configmap.yaml"

# 5. Deploy MongoDB
echo ">>> Deploying MongoDB..."
kubectl apply -f "$ROOT_DIR/k8s/mongodb/"
echo "Waiting for MongoDB pod to be ready..."
kubectl rollout status deployment/mongodb -n "$NAMESPACE" --timeout=90s

# 6. Deploy Backend
echo ">>> Deploying Backend..."
kubectl apply -f "$ROOT_DIR/k8s/backend/backend-deployment.yaml"
kubectl apply -f "$ROOT_DIR/k8s/backend/backend-service.yaml"
echo "Waiting for Backend rollout..."
kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=90s

# 7. Deploy Frontend
echo ">>> Deploying Frontend..."
kubectl apply -f "$ROOT_DIR/k8s/frontend/"
echo "Waiting for Frontend rollout..."
kubectl rollout status deployment/frontend -n "$NAMESPACE" --timeout=90s

# 8. Deploy Collector Service
echo ">>> Deploying Collector Service..."
kubectl apply -f "$ROOT_DIR/k8s/collector/"
echo "Waiting for Collector rollout..."
kubectl rollout status deployment/collector-service -n "$NAMESPACE" --timeout=90s

echo ""
echo "========================================================"
echo " Deployment Complete! Status Summary:"
echo "========================================================"
kubectl get pods -n "$NAMESPACE" -o wide
echo ""
kubectl get services -n "$NAMESPACE"
echo "========================================================"
echo ""
echo ">>> Access Commands:"
echo "  Frontend Web UI : kubectl port-forward svc/frontend -n $NAMESPACE 8080:80"
echo "                    -> Open http://localhost:8080"
echo "  Backend API     : kubectl port-forward svc/backend -n $NAMESPACE 3000:3000"
echo "                    -> Health check: curl http://localhost:3000/health"
echo "  Collector API   : kubectl port-forward svc/collector-service -n $NAMESPACE 8000:8000"
echo "                    -> Health check: curl http://localhost:8000/health"
echo "========================================================"
