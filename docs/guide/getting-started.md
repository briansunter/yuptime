# Getting Started

This guide will help you install Yuptime and create your first monitor in under 5 minutes.

## Prerequisites

- Kubernetes cluster (1.26+)
- `kubectl` configured to access your cluster
- (Optional) Helm 3.x or Timoni for package-based installation

## Installation

Choose your preferred installation method:

::: code-group

```bash [Timoni (Recommended)]
# Install Timoni if you haven't already
brew install stefanprodan/tap/timoni

# Deploy Yuptime
timoni apply yuptime oci://ghcr.io/briansunter/yuptime/timoni-module \
  --version latest \
  --namespace yuptime
```

```bash [Helm]
# Deploy with Helm
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace
```

```bash [kubectl]
# Apply CRDs first
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/crds.yaml

# Create namespace and deploy
kubectl create namespace yuptime
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/all.yaml -n yuptime
```

:::

## Verify Installation

Check that Yuptime is running:

```bash
# Check pods
kubectl get pods -n yuptime
```

Expected output:
```
NAME                          READY   STATUS    RESTARTS   AGE
yuptime-api-6d4f5b7c8-x2k9m   1/1     Running   0          30s
```

Check that CRDs are installed:

```bash
kubectl get crds | grep yuptime
```

Expected output:
```
maintenancewindows.monitoring.yuptime.io   2025-12-30T10:00:00Z
monitors.monitoring.yuptime.io             2025-12-30T10:00:00Z
monitorsets.monitoring.yuptime.io          2025-12-30T10:00:00Z
silences.monitoring.yuptime.io             2025-12-30T10:00:00Z
yuptimesettings.monitoring.yuptime.io      2025-12-30T10:00:00Z
```

## Create Your First Monitor

Create a file called `my-monitor.yaml`:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: example-website
  namespace: yuptime
  labels:
    team: platform
    environment: production
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://example.com"
      method: GET
  successCriteria:
    http:
      acceptedStatusCodes: [200]
```

Apply it:

```bash
kubectl apply -f my-monitor.yaml
```

## Check Monitor Status

View your monitors:

```bash
kubectl get monitors -n yuptime
```

Expected output:
```
NAME              TYPE   STATUS    LATENCY   UPTIME   AGE
example-website   http   healthy   125ms     100%     1m
```

Get detailed status:

```bash
kubectl describe monitor example-website -n yuptime
```

Output includes:
```yaml
Status:
  Last Check:
    Latency Ms:  125
    Success:     true
    Timestamp:   2025-12-30T10:01:00Z
  Uptime:
    Last 24h:    100
    Last 7d:     100
```

## View Metrics

Port-forward to access the metrics server:

```bash
kubectl port-forward -n yuptime svc/yuptime-api 3000:3000
```

Check the health endpoint:

```bash
curl http://localhost:3000/health
```

View Prometheus metrics:

```bash
curl http://localhost:3000/metrics
```

## Set Up Alerting

To send alerts to Alertmanager, add the `alerting` section to your monitor:

```yaml{15-20}
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
      method: GET
  alerting:
    alertmanagerUrl: "http://alertmanager.monitoring:9093"
    labels:
      severity: critical
      team: platform
```

## Create a Maintenance Window

Suppress alerts during planned maintenance:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MaintenanceWindow
metadata:
  name: weekly-maintenance
  namespace: yuptime
spec:
  schedule: "RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=2"
  duration: "2h"
  selector:
    matchLabels:
      environment: production
```

## Next Steps

Now that you have Yuptime running:

- [Learn about all monitor types](/reference/monitors/http)
- [Explore the CRD reference](/reference/crds/monitor)
- [Set up GitOps with Flux or Argo CD](/guide/gitops)
- [Configure Prometheus and Grafana dashboards](/guide/metrics)
- [View example configurations](/examples/)
