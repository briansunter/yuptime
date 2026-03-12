# Suppressions

Yuptime supports recurring suppression with `MaintenanceWindow` and one-off suppression with `Silence`.

## Quick Comparison

| Resource | Best For | Time Model |
|----------|----------|------------|
| `MaintenanceWindow` | Repeating maintenance, scheduled change windows | `start` + `end` + optional RRULE |
| `Silence` | Incidents, temporary muting, one-time deploys | `expiresAt` |

## MaintenanceWindow

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

Use `MaintenanceWindow` when the mute period repeats. The RRULE prefix is optional, so both `FREQ=WEEKLY;BYDAY=SU` and `RRULE:FREQ=WEEKLY;BYDAY=SU` work.

## Silence

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Silence
metadata:
  name: incident-123
  namespace: yuptime
spec:
  expiresAt: "2026-03-15T14:00:00Z"
  match:
    labels:
      service: payments
    tags:
      - production
  reason: "INC-123 mitigation in progress"
```

Use `Silence` when you need a single mute that automatically ends at a known time.

## Selector Shapes

Both resources use selector-style matching:

```yaml
match:
  matchNamespaces:
    - yuptime
  matchLabels:
    matchLabels:
      team: platform
  matchTags:
    - api
```

```yaml
match:
  names:
    - namespace: yuptime
      name: critical-api
  namespaces:
    - yuptime
  labels:
    severity: critical
  tags:
    - production
```

## Status

```yaml
status:
  isActive: true
  nextOccurrence: "2026-03-22T02:00:00Z"
  monitorCount: 8
```

```yaml
status:
  isActive: true
  expiresIn: "45m"
  affectedCount: 3
```

## Guidance

1. Use `MaintenanceWindow` for recurring events.
2. Use `Silence` for one-off events.
3. Match as narrowly as possible to avoid muting unrelated monitors.
4. Keep `reason` short and operationally useful.
