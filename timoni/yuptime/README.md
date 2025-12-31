# Yuptime Timoni Module

A [timoni.sh](https://timoni.sh) module for deploying Yuptime, a Kubernetes-native monitoring solution.

## Architecture

Yuptime uses a **pure CRD-based architecture** where all configuration and state is stored in Kubernetes Custom Resources. No external database is required - monitor results are written directly to the CRD status subresource.

## Prerequisites

1. **Kubernetes cluster** (OrbStack, minikube, or any K8s cluster v1.26+)
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
timoni apply yuptime ./timoni/yuptime -n yuptime
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
| `checkerImage.repository` | Checker executor image | `ghcr.io/yuptime/yuptime-checker` |
| `mode` | Application mode (`development`, `production`) | `development` |
| `logging.level` | Log level (`debug`, `info`, `warn`, `error`) | `info` |
| `networkPolicy.enabled` | Enable NetworkPolicy | `true` |
| `podDisruptionBudget.enabled` | Enable PDB | `true` |
| `crds.install` | Install CRDs via Timoni | `false` |

### Example: Local Development

```cue
values: {
    image: {
        repository: "yuptime-api"
        tag:        "latest"
        pullPolicy: "Never"
    }
    mode: "development"
}
```

## CRDs

Yuptime defines 5 Custom Resources:

1. **Monitor** - Single health check definition
2. **MonitorSet** - Bulk monitor definitions with templating
3. **MaintenanceWindow** - Planned maintenance (RRULE support)
4. **Silence** - Ad-hoc alert muting
5. **YuptimeSettings** - Cluster-scoped global configuration

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
