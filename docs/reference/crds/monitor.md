# Monitor

`Monitor` defines a single health check.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: my-api
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://api.example.com/health"
  successCriteria:
    http:
      acceptedStatusCodes: [200]
  alertmanagerUrl: "http://alertmanager.monitoring:9093/api/v2/alerts"
  alerting:
    notifyOn:
      down: true
      up: false
```

## Core Fields

### `spec.type`

Current enum values:

- `http`
- `tcp`
- `ping`
- `dns`
- `keyword`
- `jsonQuery`
- `xmlQuery`
- `htmlQuery`
- `websocket`
- `push`
- `steam`
- `k8s`
- `docker` (reserved placeholder)
- `mysql`
- `postgresql`
- `redis`
- `grpc`

### `spec.schedule`

```yaml
schedule:
  intervalSeconds: 60
  timeoutSeconds: 30
  retries:
    maxRetries: 2
    retryIntervalSeconds: 5
  initialDelaySeconds: 0
  graceDownSeconds: 0
  jitterPercent: 5
```

### `spec.target`

Target shape depends on the monitor type. The CRD mirror intentionally leaves nested target branches flexible so the runtime Zod schemas can validate protocol-specific details.

### `spec.successCriteria`

Success criteria are optional and type-specific. For example:

```yaml
successCriteria:
  http:
    acceptedStatusCodes: [200]
    latencyMsUnder: 500
```

### `spec.alertmanagerUrl`

The direct Alertmanager endpoint to POST alerts to.

### `spec.alerting`

Optional alert behavior controls:

```yaml
alerting:
  resendIntervalMinutes: 0
  notifyOn:
    down: true
    up: false
    flapping: true
    certExpiring: true
```

## Status

The controller and checker Jobs update the status subresource.

```yaml
status:
  observedGeneration: 1
  lastResult:
    state: up
    checkedAt: "2026-03-15T10:00:00Z"
    latencyMs: 125
    attempts: 1
  previousResult:
    state: down
    checkedAt: "2026-03-15T09:59:00Z"
    latencyMs: 0
    attempts: 1
  uptime:
    last24h: 99.95
  cert:
    expiresAt: "2026-06-01T00:00:00Z"
    daysRemaining: 78
    valid: true
  nextRunAt: "2026-03-15T10:01:00Z"
```
