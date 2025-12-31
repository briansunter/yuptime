# Examples

Real-world examples of Yuptime configurations for common use cases.

## Quick Links

- [HTTP Monitoring](#basic-http-monitor) — Websites, APIs, health endpoints
- [API with Authentication](#api-with-authentication) — Bearer, Basic, OAuth2
- [Database Monitoring](#database-health-check) — MySQL, PostgreSQL, Redis
- [Kubernetes Resources](#kubernetes-deployment) — Deployments, pods, services
- [API Validation](#json-api-validation) — JSON/XML/HTML response checking
- [Bulk Monitoring](#monitorset-for-multiple-endpoints) — MonitorSet for multiple endpoints
- [Maintenance Windows](#maintenance-window) — Scheduled suppressions
- [Complete Setup](#complete-production-setup) — Full production example

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

## API with Authentication

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
      authType: bearer
      bearerToken:
        secretRef:
          name: api-credentials
          key: token
  successCriteria:
    http:
      acceptedStatusCodes: [200]
```

## Database Health Check

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
      user: "monitor"
      password:
        secretRef:
          name: postgres-credentials
          key: password
      query: "SELECT 1"
      sslMode: require
```

## Kubernetes Deployment

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

## JSON API Validation

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
      queries:
        - path: "$.status"
          operator: equals
          value: "healthy"
        - path: "$.services[*].status"
          operator: all_equal
          value: "up"
```

## MonitorSet for Multiple Endpoints

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
    alerting:
      alertmanagerUrl: "http://alertmanager:9093"
  monitors:
    - name: users-service
      type: http
      target:
        http:
          url: "http://users-service.default:8080/health"
    - name: orders-service
      type: http
      target:
        http:
          url: "http://orders-service.default:8080/health"
    - name: payments-service
      type: http
      target:
        http:
          url: "http://payments-service.default:8080/health"
```

## Maintenance Window

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

## Complete Production Setup

A comprehensive example with all components:

```yaml
# 1. Global settings
apiVersion: monitoring.yuptime.io/v1
kind: YuptimeSettings
metadata:
  name: default
spec:
  mode:
    gitOpsReadOnly: true
  scheduler:
    maxConcurrentChecks: 50
    jitterWindow: 30
  networking:
    dnsResolvers:
      - "8.8.8.8"
---
# 2. Main API monitor
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
      method: GET
  successCriteria:
    http:
      acceptedStatusCodes: [200]
      maxLatencyMs: 500
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: critical
---
# 3. Database monitor
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: main-db
  namespace: yuptime
  labels:
    tier: critical
    environment: production
spec:
  type: postgresql
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    postgresql:
      host: "postgres.database.svc.cluster.local"
      port: 5432
      database: "production"
      user: "monitor"
      password:
        secretRef:
          name: db-credentials
          key: password
---
# 4. Maintenance window
apiVersion: monitoring.yuptime.io/v1
kind: MaintenanceWindow
metadata:
  name: db-maintenance
  namespace: yuptime
spec:
  schedule: "RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=2"
  duration: "1h"
  selector:
    matchLabels:
      tier: critical
```
