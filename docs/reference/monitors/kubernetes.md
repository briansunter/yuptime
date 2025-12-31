# Kubernetes Monitor

Checks the health of Kubernetes resources like Deployments, StatefulSets, DaemonSets, and Pods.

## Basic Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: api-deployment
  namespace: yuptime
spec:
  type: kubernetes
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    kubernetes:
      namespace: production
      name: api
      kind: Deployment
      minReadyReplicas: 2
```

## Target Configuration

```yaml
target:
  kubernetes:
    namespace: "production"       # Resource namespace
    name: "my-app"                # Resource name
    kind: Deployment              # Deployment, StatefulSet, DaemonSet, Pod, Service
    minReadyReplicas: 1           # Minimum ready replicas required
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `namespace` | Yes | - | Resource namespace |
| `name` | Yes | - | Resource name |
| `kind` | Yes | - | Resource type |
| `minReadyReplicas` | No | `1` | Minimum replicas for health |

## Supported Kinds

| Kind | Health Check |
|------|--------------|
| `Deployment` | Ready replicas ≥ minReadyReplicas |
| `StatefulSet` | Ready replicas ≥ minReadyReplicas |
| `DaemonSet` | Ready pods on all nodes |
| `Pod` | Pod phase = Running, containers ready |
| `Service` | Has endpoints |

## Examples

### Deployment with Minimum Replicas

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: web-deployment
  namespace: yuptime
spec:
  type: kubernetes
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    kubernetes:
      namespace: production
      name: web-frontend
      kind: Deployment
      minReadyReplicas: 3
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: critical
```

### StatefulSet

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: postgres-statefulset
  namespace: yuptime
spec:
  type: kubernetes
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    kubernetes:
      namespace: database
      name: postgres
      kind: StatefulSet
      minReadyReplicas: 1
```

### DaemonSet

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: fluentd-daemonset
  namespace: yuptime
spec:
  type: kubernetes
  schedule:
    intervalSeconds: 120
    timeoutSeconds: 10
  target:
    kubernetes:
      namespace: logging
      name: fluentd
      kind: DaemonSet
```

### Service Endpoints

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: api-service
  namespace: yuptime
spec:
  type: kubernetes
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    kubernetes:
      namespace: production
      name: api
      kind: Service
```

## Status

```yaml
status:
  state: healthy
  lastCheck:
    success: true
    latencyMs: 15
    timestamp: "2025-12-30T10:00:00Z"
    message: "Deployment has 3/3 ready replicas"
```

## Best Practices

1. **Set realistic `minReadyReplicas`** — Match your availability requirements, not total replicas
2. **Monitor critical workloads** — Focus on user-facing deployments and stateful services
3. **Use with other monitors** — Combine with HTTP/TCP checks for full coverage
4. **Label consistently** — Use labels for maintenance windows and silences

## Troubleshooting

**Resource not found**: Verify namespace and name are correct
```bash
kubectl get deployment api -n production
```

**Insufficient replicas**: Check pod status and events
```bash
kubectl describe deployment api -n production
kubectl get pods -l app=api -n production
```

**RBAC errors**: Ensure Yuptime has permissions to read the resource
```bash
kubectl auth can-i get deployments -n production --as=system:serviceaccount:yuptime:yuptime-api
```
