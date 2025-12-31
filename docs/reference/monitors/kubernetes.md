# Kubernetes Monitor

The Kubernetes monitor checks the health of Kubernetes resources within the cluster.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: k8s-deployment-check
  namespace: yuptime
spec:
  type: kubernetes
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    kubernetes:
      namespace: "production"
      name: "api-deployment"
      kind: Deployment
      minReadyReplicas: 2
```

## Target Configuration

```yaml
target:
  kubernetes:
    namespace: "production"            # Resource namespace
    name: "api-deployment"             # Resource name
    kind: Deployment                    # Resource kind
    minReadyReplicas: 1                 # Minimum required ready replicas
```

## Supported Kinds

| Kind | Health Check |
|------|--------------|
| `Deployment` | Ready replicas vs desired replicas |
| `StatefulSet` | Ready replicas vs desired replicas |
| `DaemonSet` | Ready pods on nodes |
| `Pod` | Pod phase and container readiness |
| `Service` | Endpoint availability |

## Alternative K8s Target

For more flexible checks, use the `k8s` target:

```yaml
target:
  k8s:
    resource:
      apiVersion: apps/v1
      kind: Deployment
      name: my-deployment
    check:
      type: AvailableReplicasAtLeast
      min: 2
```

### Check Types

| Type | Description |
|------|-------------|
| `AvailableReplicasAtLeast` | Minimum available replicas |
| `PodReadiness` | All pods are ready |
| `EndpointNonEmpty` | Service has endpoints |
