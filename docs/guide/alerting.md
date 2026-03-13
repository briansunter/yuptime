# Alerting

Yuptime sends monitor state changes directly to Alertmanager. There is no in-repo notification provider layer; route and fan out notifications in Alertmanager itself.

## Monitor Configuration

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
      flapping: true
      certExpiring: true
```

## Payload Inputs

Yuptime includes monitor context such as:

- monitor name
- namespace
- monitor type
- current state
- tags, if present on `spec.tags`

Use Alertmanager routing rules to send those alerts to Slack, PagerDuty, email, or other downstream systems.

## Suppressions

### MaintenanceWindow

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

### Silence

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Silence
metadata:
  name: deploy-silence
  namespace: yuptime
spec:
  expiresAt: "2026-03-15T14:30:00Z"
  match:
    labels:
      environment: production
  reason: "Deployment window"
```
