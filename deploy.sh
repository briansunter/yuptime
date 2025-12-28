#!/bin/bash
# Deploy Yuptime to Kubernetes
# Usage: ./deploy.sh [values-file]
#   ./deploy.sh                    # Use default values
#   ./deploy.sh values-orbstack.cue  # Use OrbStack values

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALUES_FILE="${1:-}"
NAMESPACE="${NAMESPACE:-yuptime}"

echo "==> Applying CRDs..."
kubectl apply -f "$SCRIPT_DIR/k8s/crds.yaml"

echo "==> Waiting for CRDs to be established..."
kubectl wait --for=condition=Established crd/monitors.monitoring.yuptime.io --timeout=30s
kubectl wait --for=condition=Established crd/yuptimesettings.monitoring.yuptime.io --timeout=30s

echo "==> Deploying Yuptime with Timoni..."
if [ -n "$VALUES_FILE" ]; then
    timoni apply yuptime "$SCRIPT_DIR/timoni/yuptime" -n "$NAMESPACE" -f "$VALUES_FILE"
else
    timoni apply yuptime "$SCRIPT_DIR/timoni/yuptime" -n "$NAMESPACE"
fi

echo "==> Deployment complete!"
echo ""
echo "Check status:"
echo "  kubectl get all -n $NAMESPACE"
echo "  kubectl get monitors -A"
