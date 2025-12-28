# Yuptime Timoni Module

A [timoni.sh](https://timoni.sh) module for deploying Yuptime, a Kubernetes-native monitoring solution.

## Prerequisites

1. **Kubernetes cluster** (OrbStack, minikube, or any K8s cluster)
2. **Timoni CLI**: `brew install stefanprodan/tap/timoni`

## Quick Start

### Option 1: Deploy Script (Recommended)

```bash
# For OrbStack/local development
./deploy.sh values-orbstack.cue

# Default deployment
./deploy.sh
```

### Option 2: Manual Steps

```bash
# Step 1: Install CRDs (once per cluster)
kubectl apply -f k8s/crds.yaml

# Step 2: Deploy with Timoni
timoni apply yuptime ./timoni/yuptime -n yuptime -f values-orbstack.cue
```

## Creating Monitors

After deployment, create monitors in the `yuptime` namespace:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: my-website
  namespace: yuptime
spec:
  type: http
  target:
    http:
      url: https://example.com
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
```

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `image.repository` | API image | `ghcr.io/yuptime/yuptime-api` |
| `database.type` | Database backend (`sqlite`, `postgresql`, `etcd`) | `sqlite` |
| `database.etcd.deploy` | Deploy etcd StatefulSet | `false` |
| `auth.mode` | Authentication (`local`, `oidc`, `disabled`) | `local` |
| `storage.enabled` | Enable PVC for data | `true` |
| `networkPolicy.enabled` | Enable NetworkPolicy | `true` |
| `podDisruptionBudget.enabled` | Enable PDB | `true` |

### Example: Local Development

```cue
values: {
    image: {
        repository: "yuptime-api"
        tag:        "latest"
        pullPolicy: "Never"
    }
    database: {
        type: "etcd"
        etcd: deploy: true
    }
    mode: "development"
}
```

## Uninstall

```bash
timoni delete yuptime -n yuptime
kubectl delete -f k8s/crds.yaml  # Optional: remove CRDs
```

## Why CRDs Are Applied Separately

This follows Kubernetes best practices:
- CRDs are cluster-scoped infrastructure (not namespaced)
- Managed independently for GitOps workflows (Flux, ArgoCD)
- Avoids upgrade conflicts when CRD schema changes
- Standard pattern used by Prometheus Operator, cert-manager, etc.
