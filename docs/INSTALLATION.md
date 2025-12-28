# Installation Guide

Choose your preferred installation method:

## Option 1: Helm (Recommended)

Using the published Helm chart from GitHub Container Registry:

```bash
# Login (first time only)
helm registry login ghcr.io

# Install
helm install yuptime oci://ghcr.io/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace

# With custom values
helm install yuptime oci://ghcr.io/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace \
  --set database.type=postgresql \
  --set auth.mode=oidc
```

**Values reference:** See [values.yaml](../helm/yuptime/values.yaml)

## Option 2: Timoni

For GitOps workflows with Flux/Argo CD:

```bash
# Install Timoni
brew install timoni

# Pull and install
timoni mod pull oci://ghcr.io/yuptime/timoni/yuptime -o ./timoni/yuptime
timoni bundle apply yuptime -n yuptime -f values.yaml
```

## Option 3: kubectl (Static Manifests)

For simple deployments:

```bash
# Download manifests
curl -LO https://github.com/yuptime/yuptime/releases/latest/download/manifests.tar.gz
tar xzf manifests.tar.gz

# Apply CRDs first
kubectl apply -f manifests/crds.yaml

# Apply resources
kubectl apply -f manifests/all.yaml
```

## Quick Start

After installation, verify and access:

```bash
# Check pods
kubectl get pods -n yuptime

# Port-forward
kubectl port-forward -n yuptime svc/yuptime-api 3000:3000

# Access
open http://localhost:3000
```

## First Monitor

Create your first health check:

```yaml
kubectl apply -f - <<EOF
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: example-website
  namespace: yuptime
spec:
  type: http
  http:
    url: https://example.com
  schedule:
    intervalSeconds: 60
  alert:
    threshold: 3
EOF
```

## Uninstalling

### Helm
```bash
helm uninstall yuptime -n yuptime
```

### Timoni
```bash
timoni delete yuptime -n yuptime
```

### kubectl
```bash
kubectl delete -f manifests/all.yaml
kubectl delete namespace yuptime
```

## Next Steps

- Configure alerts with NotificationProvider
- Create a status page
- Set up maintenance windows
- See [documentation](../) for more details
