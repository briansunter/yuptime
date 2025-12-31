# High Availability

Yuptime is designed as a single-instance application with built-in resilience.

## Architecture

Yuptime uses a **single scheduler with isolated workers** pattern:

```
┌─────────────────────┐
│   Yuptime Pod       │  ← Single instance (uses Kubernetes Lease)
│   (Controller)      │
└─────────────────────┘
         │
         │ Creates Jobs
         ▼
┌─────────────────────────────────────────┐
│          Checker Job Pods               │  ← Multiple isolated workers
├─────────┬─────────┬─────────┬──────────┤
│ Check 1 │ Check 2 │ Check 3 │ Check N  │
└─────────┴─────────┴─────────┴──────────┘
```

## Single Instance Guarantee

Yuptime uses a Kubernetes Lease to ensure only one scheduler runs:

```yaml
# YuptimeSettings
spec:
  mode:
    singleInstanceRequired: true
```

If the pod fails, Kubernetes restarts it. The Lease prevents duplicate scheduling.

## Resilience Features

### Isolated Execution

Each check runs in its own pod:
- Failures don't cascade
- Resources are isolated
- Easy to debug

### Stateless Design

No database means:
- Fast recovery after restart
- No data corruption risk
- State is in Kubernetes API (etcd)

### Deterministic Jitter

Checks resume at consistent times after restart thanks to hash-based scheduling.

## Recommendations

### Resource Limits

```yaml
resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 1Gi
```

### Pod Disruption Budget

```yaml
podDisruptionBudget:
  enabled: true
  minAvailable: 1
```

### Node Selection

Run on stable nodes:

```yaml
nodeSelector:
  kubernetes.io/os: linux
  node-role.kubernetes.io/worker: ""

tolerations:
  - key: "CriticalAddonsOnly"
    operator: "Exists"
```

## Monitoring Yuptime

Monitor Yuptime itself:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: yuptime-health
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    http:
      url: "http://yuptime-api.yuptime:3000/health"
      method: GET
```
