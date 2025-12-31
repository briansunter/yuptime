# Metrics

Yuptime exposes Prometheus metrics for monitoring and alerting on monitor health.

## Accessing Metrics

Metrics are exposed on port 3000 at `/metrics`:

```bash
# Port forward
kubectl port-forward -n yuptime svc/yuptime-api 3000:3000

# Fetch metrics
curl http://localhost:3000/metrics
```

## Available Metrics

### Monitor Status

```promql
# Current monitor status (1 = up, 0 = down)
yuptime_monitor_status{name="my-monitor", namespace="yuptime", type="http"}
```

### Check Latency

```promql
# Check latency histogram
yuptime_monitor_latency_seconds_bucket{name="my-monitor", le="0.1"}
yuptime_monitor_latency_seconds_sum{name="my-monitor"}
yuptime_monitor_latency_seconds_count{name="my-monitor"}
```

### Check Counts

```promql
# Total checks performed
yuptime_monitor_checks_total{name="my-monitor", result="success"}
yuptime_monitor_checks_total{name="my-monitor", result="failure"}

# Failures only
yuptime_monitor_failures_total{name="my-monitor"}
```

### Uptime

```promql
# Uptime percentage
yuptime_monitor_uptime_ratio{name="my-monitor", period="24h"}
yuptime_monitor_uptime_ratio{name="my-monitor", period="7d"}
```

## Prometheus Configuration

### ServiceMonitor (Prometheus Operator)

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: yuptime
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: yuptime-api
  namespaceSelector:
    matchNames:
      - yuptime
  endpoints:
    - port: http
      interval: 30s
      path: /metrics
```

### Prometheus Config

```yaml
scrape_configs:
  - job_name: 'yuptime'
    kubernetes_sd_configs:
      - role: service
        namespaces:
          names:
            - yuptime
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_name]
        regex: yuptime-api
        action: keep
```

## Grafana Dashboard

### Status Overview

```promql
# All monitors status
sum by (name) (yuptime_monitor_status)

# Unhealthy monitors
count(yuptime_monitor_status == 0)

# Total monitors
count(yuptime_monitor_status)
```

### Latency

```promql
# Average latency
rate(yuptime_monitor_latency_seconds_sum[5m]) / rate(yuptime_monitor_latency_seconds_count[5m])

# P95 latency
histogram_quantile(0.95, rate(yuptime_monitor_latency_seconds_bucket[5m]))

# P99 latency
histogram_quantile(0.99, rate(yuptime_monitor_latency_seconds_bucket[5m]))
```

### Error Rate

```promql
# Error rate
rate(yuptime_monitor_failures_total[5m]) / rate(yuptime_monitor_checks_total[5m])

# Checks per second
rate(yuptime_monitor_checks_total[5m])
```

## Alerting Rules

### High Error Rate

```yaml
groups:
  - name: yuptime
    rules:
      - alert: YuptimeMonitorDown
        expr: yuptime_monitor_status == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Monitor {{ $labels.name }} is down"
          description: "Monitor has been unhealthy for more than 5 minutes"

      - alert: YuptimeHighLatency
        expr: |
          histogram_quantile(0.95, rate(yuptime_monitor_latency_seconds_bucket[5m])) > 1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High latency for {{ $labels.name }}"
          description: "P95 latency is above 1 second"
```

## Example Dashboard JSON

```json
{
  "title": "Yuptime Overview",
  "panels": [
    {
      "title": "Monitor Status",
      "type": "stat",
      "targets": [
        {
          "expr": "count(yuptime_monitor_status == 1)",
          "legendFormat": "Healthy"
        },
        {
          "expr": "count(yuptime_monitor_status == 0)",
          "legendFormat": "Unhealthy"
        }
      ]
    },
    {
      "title": "Latency (P95)",
      "type": "graph",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(rate(yuptime_monitor_latency_seconds_bucket[5m])) by (name, le))",
          "legendFormat": "{{ name }}"
        }
      ]
    }
  ]
}
```

## Health Endpoints

Yuptime also exposes health endpoints:

```bash
# Liveness probe
curl http://localhost:3000/health

# Readiness probe
curl http://localhost:3000/ready
```
