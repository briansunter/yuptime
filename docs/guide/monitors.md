# Monitors

Monitors are the core resource in Yuptime. Each monitor defines a single health check that runs on a schedule.

## Overview

A monitor consists of:
- **Type**: What kind of check (HTTP, TCP, DNS, etc.)
- **Schedule**: How often to run and timeout
- **Target**: What to check
- **Success Criteria**: What constitutes success
- **Alerting**: Where to send alerts (optional)

## Basic Structure

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: my-monitor
  namespace: yuptime
  labels:
    team: platform
spec:
  type: http                    # Monitor type
  schedule:
    intervalSeconds: 60         # Check every 60 seconds
    timeoutSeconds: 30          # Timeout after 30 seconds
  target:
    http:                       # Target config (varies by type)
      url: "https://example.com"
      method: GET
  successCriteria:
    http:                       # Success criteria (varies by type)
      acceptedStatusCodes: [200]
  alerting:                     # Optional
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: critical
```

## Monitor Types

| Type | Description | Target Key |
|------|-------------|------------|
| `http` | HTTP/HTTPS endpoints | `target.http` |
| `tcp` | TCP port connectivity | `target.tcp` |
| `dns` | DNS record queries | `target.dns` |
| `ping` | ICMP ping | `target.ping` |
| `websocket` | WebSocket connections | `target.websocket` |
| `grpc` | gRPC health checks | `target.grpc` |
| `mysql` | MySQL database | `target.mysql` |
| `postgresql` | PostgreSQL database | `target.postgresql` |
| `redis` | Redis cache | `target.redis` |
| `kubernetes` | K8s resource health | `target.kubernetes` |
| `push` | Push-based monitoring | `target.push` |
| `steam` | Steam game servers | `target.steam` |

## Schedule

```yaml
schedule:
  intervalSeconds: 60    # How often to run (required)
  timeoutSeconds: 30     # Max time for check (required)
```

**Recommendations**:
- Critical services: 30 seconds
- Standard services: 60 seconds
- Background services: 300 seconds

## Labels

Use labels for:
- Organizing monitors
- Selecting in MaintenanceWindows and Silences
- Routing alerts in Alertmanager

```yaml
metadata:
  labels:
    team: platform
    environment: production
    tier: critical
    service: api
```

## Status

The controller updates the status subresource:

```yaml
status:
  state: healthy              # healthy, unhealthy, degraded, unknown
  lastCheck:
    timestamp: "2025-12-30T10:00:00Z"
    success: true
    latencyMs: 125
    message: "HTTP 200 OK"
  uptime:
    last24h: 99.95
    last7d: 99.98
```

## Viewing Monitors

```bash
# List all monitors
kubectl get monitors -n yuptime

# Wide output with status
kubectl get monitors -n yuptime -o wide

# Detailed status
kubectl describe monitor my-monitor -n yuptime

# JSON output
kubectl get monitor my-monitor -n yuptime -o jsonpath='{.status}'
```

## Common Patterns

### Health Endpoint

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: api-health
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
  successCriteria:
    http:
      acceptedStatusCodes: [200]
      maxLatencyMs: 500
```

### Database Check

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: postgres-health
  namespace: yuptime
spec:
  type: postgresql
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    postgresql:
      host: "postgres.db.svc.cluster.local"
      port: 5432
      database: "myapp"
      user: "monitor"
      password:
        secretRef:
          name: db-credentials
          key: password
```

### Deployment Health

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: app-deployment
  namespace: yuptime
spec:
  type: kubernetes
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    kubernetes:
      kind: Deployment
      name: my-app
      namespace: production
      expectedReplicas: 3
```

## Next Steps

- [HTTP Monitor Reference](/reference/monitors/http)
- [CRD Reference](/reference/crds/monitor)
- [Examples](/examples/)
