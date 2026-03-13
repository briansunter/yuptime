# Getting Started

This guide installs Yuptime and creates your first monitor using the current monitor-only CRD set.

## Prerequisites

- Kubernetes cluster `1.26+`
- `kubectl` configured
- Optional: Helm 3 or Timoni

## Installation

::: code-group

```bash [Timoni (Recommended)]
timoni apply yuptime oci://ghcr.io/briansunter/yuptime/timoni-module \
  --version latest \
  --namespace yuptime
```

```bash [Helm]
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace
```

```bash [kubectl]
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/k8s/crds.yaml
kubectl create namespace yuptime
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/all.yaml -n yuptime
```

:::

## Verify Installation

```bash
kubectl get pods -n yuptime
kubectl get crds | grep yuptime
kubectl port-forward -n yuptime svc/yuptime-api 3000:3000
curl http://localhost:3000/health
```

## Create Your First Monitor

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: example-website
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://example.com"
  successCriteria:
    http:
      acceptedStatusCodes: [200]
```

```bash
kubectl apply -f my-monitor.yaml
kubectl get monitors -n yuptime
kubectl describe monitor example-website -n yuptime
```

## Alertmanager Integration

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: critical-api
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    http:
      url: "https://api.example.com/health"
  alertmanagerUrl: "http://alertmanager.monitoring:9093/api/v2/alerts"
  alerting:
    notifyOn:
      down: true
      up: false
```

## Maintenance Windows

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MaintenanceWindow
metadata:
  name: weekly-maintenance
  namespace: yuptime
spec:
  enabled: true
  schedule:
    start: "2026-03-15T02:00:00Z"
    end: "2026-03-15T04:00:00Z"
    recurrence:
      rrule: "FREQ=WEEKLY;BYDAY=SU"
  match:
    matchLabels:
      matchLabels:
        environment: production
  behavior:
    suppressNotifications: true
```

## Next Steps

- [Monitor guide](/guide/monitors)
- [CRD reference](/reference/crds/monitor)
- [Examples](/examples/)
