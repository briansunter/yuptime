# MonitorSet

The MonitorSet CRD allows you to define multiple monitors in a single resource with shared defaults.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MonitorSet
metadata:
  name: api-endpoints
  namespace: yuptime
spec:
  defaults:
    schedule:
      intervalSeconds: 60
      timeoutSeconds: 30
    successCriteria:
      http:
        acceptedStatusCodes: [200]
    alerting:
      alertmanagerUrl: "http://alertmanager.monitoring:9093"
  monitors:
    - name: users-api
      type: http
      target:
        http:
          url: "https://api.example.com/users"
      labels:
        service: users

    - name: orders-api
      type: http
      target:
        http:
          url: "https://api.example.com/orders"
      labels:
        service: orders

    - name: payments-api
      type: http
      target:
        http:
          url: "https://api.example.com/payments"
      labels:
        service: payments
```

## Spec

### `defaults` (optional)

Default configuration applied to all monitors in the set:

```yaml
defaults:
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  successCriteria:
    http:
      acceptedStatusCodes: [200, 201]
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      team: platform
  tags:
    - api
    - production
```

### `monitors` (required)

Array of monitor definitions. Each monitor inherits from `defaults` but can override any field:

```yaml
monitors:
  - name: my-monitor           # Required: unique name within the set
    type: http                 # Required: monitor type
    target:                    # Required: target configuration
      http:
        url: "https://example.com"
    labels:                    # Optional: additional labels
      custom: value
    schedule:                  # Optional: override defaults
      intervalSeconds: 30
    successCriteria:           # Optional: override defaults
      http:
        acceptedStatusCodes: [200]
```

## Status

The MonitorSet status tracks the state of all contained monitors:

```yaml
status:
  # Summary
  totalCount: 3
  healthyCount: 2
  unhealthyCount: 1

  # Individual monitor statuses
  monitors:
    - name: users-api
      state: healthy
      lastCheck: "2025-12-30T10:00:00Z"
    - name: orders-api
      state: healthy
      lastCheck: "2025-12-30T10:00:00Z"
    - name: payments-api
      state: unhealthy
      lastCheck: "2025-12-30T10:00:00Z"

  # Conditions
  conditions:
    - type: Ready
      status: "True"
      reason: "MonitorsCreated"
      message: "All 3 monitors created"
```

## How It Works

MonitorSet is a **convenience resource** for bulk definitions. The monitors are defined inline within the MonitorSet, not as separate CRDs.

```
┌─────────────────────────────────────────┐
│             MonitorSet                   │
│  ┌─────────────────────────────────┐    │
│  │  defaults:                      │    │
│  │    schedule: { interval: 60 }   │    │
│  └─────────────────────────────────┘    │
│  ┌───────────┐ ┌───────────┐ ┌────────┐│
│  │ Monitor 1 │ │ Monitor 2 │ │Monitor 3││
│  │ (inline)  │ │ (inline)  │ │(inline) ││
│  └───────────┘ └───────────┘ └────────┘│
└─────────────────────────────────────────┘
```

The controller processes each inline monitor definition and schedules checks accordingly.

## Use Cases

### Environment-based Sets

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MonitorSet
metadata:
  name: production-apis
  namespace: yuptime
spec:
  defaults:
    schedule:
      intervalSeconds: 30
      timeoutSeconds: 10
    alerting:
      alertmanagerUrl: "http://alertmanager:9093"
      labels:
        environment: production
        severity: critical
  monitors:
    - name: api-v1
      type: http
      target:
        http:
          url: "https://api.prod.example.com/v1/health"
    - name: api-v2
      type: http
      target:
        http:
          url: "https://api.prod.example.com/v2/health"
```

### Service Group

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MonitorSet
metadata:
  name: payment-service
  namespace: yuptime
spec:
  defaults:
    schedule:
      intervalSeconds: 60
      timeoutSeconds: 30
    alerting:
      labels:
        team: payments
  monitors:
    - name: payment-api
      type: http
      target:
        http:
          url: "https://payment.example.com/health"
    - name: payment-db
      type: postgresql
      target:
        postgresql:
          host: "payment-db.example.com"
          port: 5432
          database: payments
          user: monitor
          password:
            secretRef:
              name: payment-db-creds
              key: password
    - name: payment-cache
      type: redis
      target:
        redis:
          host: "payment-redis.example.com"
          port: 6379
```

## Best Practices

1. **Group related monitors** — Keep monitors that belong together in the same MonitorSet
2. **Use defaults** — Define common configuration in defaults to reduce duplication
3. **Meaningful names** — Use descriptive names for both the MonitorSet and individual monitors
4. **Label consistently** — Apply consistent labels for selection by Silences and MaintenanceWindows
