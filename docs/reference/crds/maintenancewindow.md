# MaintenanceWindow

`MaintenanceWindow` defines a scheduled mute period. The window uses explicit start and end timestamps and can optionally recur with an RRULE.

## Example

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

## Spec

### `spec.schedule`

```yaml
schedule:
  start: "2026-03-15T02:00:00Z"
  end: "2026-03-15T04:00:00Z"
  recurrence:
    rrule: "FREQ=WEEKLY;BYDAY=SU"
```

- `start` and `end` are required ISO 8601 timestamps.
- `recurrence.rrule` is optional. Both `FREQ=WEEKLY;BYDAY=SU` and `RRULE:FREQ=WEEKLY;BYDAY=SU` are accepted.

### `spec.match`

The selector shape matches the shared selector schema:

```yaml
match:
  matchNamespaces:
    - yuptime
  matchLabels:
    matchLabels:
      environment: production
  matchTags:
    - api
```

### `spec.behavior`

```yaml
behavior:
  suppressNotifications: true
```

## Status

```yaml
status:
  observedGeneration: 1
  isActive: false
  nextOccurrence: "2026-03-22T02:00:00Z"
  monitorCount: 8
  conditions:
    - type: Ready
      status: "True"
      reason: "ScheduleValid"
      lastTransitionTime: "2026-03-15T10:00:00Z"
```

## Examples

### One-Off Maintenance

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MaintenanceWindow
metadata:
  name: cluster-upgrade
  namespace: yuptime
spec:
  enabled: true
  schedule:
    start: "2026-03-20T01:00:00Z"
    end: "2026-03-20T03:00:00Z"
  match:
    matchNamespaces:
      - yuptime
  behavior:
    suppressNotifications: true
```

### Recurring Database Window

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MaintenanceWindow
metadata:
  name: db-weekly
  namespace: yuptime
spec:
  enabled: true
  schedule:
    start: "2026-03-15T02:00:00Z"
    end: "2026-03-15T03:00:00Z"
    recurrence:
      rrule: "FREQ=WEEKLY;BYDAY=SU"
  match:
    matchLabels:
      matchLabels:
        tier: database
  behavior:
    suppressNotifications: true
```
