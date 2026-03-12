# Examples

These examples use the current monitor-only CRD surface and the CUE-backed schema mirrors in this repository.

## Basic HTTP Monitor

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: website-health
  namespace: yuptime
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

## API With Bearer Authentication

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: api-health
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://api.example.com/health"
      method: GET
      auth:
        bearer:
          tokenSecretRef:
            name: api-credentials
            key: token
  successCriteria:
    http:
      acceptedStatusCodes: [200]
```

## PostgreSQL Health Check

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
      host: "postgres.database.svc.cluster.local"
      port: 5432
      database: "myapp"
      credentialsSecretRef:
        name: postgres-credentials
        usernameKey: username
        passwordKey: password
      healthQuery: "SELECT 1"
      sslMode: require
```

## Kubernetes Resource Health

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: api-deployment
  namespace: yuptime
spec:
  type: k8s
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

## JSON Response Validation

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: api-status-check
  namespace: yuptime
spec:
  type: jsonQuery
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://api.example.com/status"
      method: GET
  successCriteria:
    jsonQuery:
      mode: jsonpath-plus
      path: "$.status"
      equals: "healthy"
```

## MonitorSet

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MonitorSet
metadata:
  name: microservices
  namespace: yuptime
spec:
  defaults:
    schedule:
      intervalSeconds: 30
      timeoutSeconds: 10
    alertmanagerUrl: "http://alertmanager.monitoring:9093/api/v1/alerts"
  items:
    - name: users-service
      spec:
        type: http
        target:
          http:
            url: "http://users-service.default:8080/health"
    - name: orders-service
      spec:
        type: http
        target:
          http:
            url: "http://orders-service.default:8080/health"
```

## Maintenance Window

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

## Complete Production Setup

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: YuptimeSettings
metadata:
  name: yuptime
spec:
  mode:
    gitOpsReadOnly: true
  scheduler:
    minIntervalSeconds: 30
    maxConcurrentNetChecks: 50
    jitterPercent: 5
  networking:
    userAgent: "Yuptime/1.0"
    dns:
      resolvers:
        - "8.8.8.8"
        - "1.1.1.1"
---
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: main-api
  namespace: yuptime
  labels:
    tier: critical
    environment: production
spec:
  type: http
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    http:
      url: "https://api.example.com/health"
  successCriteria:
    http:
      acceptedStatusCodes: [200]
      latencyMsUnder: 500
  alertmanagerUrl: "http://alertmanager.monitoring:9093/api/v1/alerts"
  alerting:
    notifyOn:
      down: true
      up: false
```
