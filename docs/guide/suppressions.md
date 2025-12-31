# Suppressions

Yuptime provides two ways to suppress alerts: MaintenanceWindows for recurring events and Silences for one-time events.

## Overview

| Resource | Use Case | Scheduling |
|----------|----------|------------|
| MaintenanceWindow | Weekly maintenance, deploy windows | RRULE (recurring) |
| Silence | Incidents, one-time work | Fixed start/end times |

## MaintenanceWindow

MaintenanceWindows suppress alerts on a recurring schedule using [RRULE](https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html) format.

### Example

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
  comment: "Weekly maintenance window"
```

### RRULE Examples

```yaml
# Every Sunday at 2am
schedule: "RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=2"

# Every day at 3am
schedule: "RRULE:FREQ=DAILY;BYHOUR=3"

# First Monday of each month at 4am
schedule: "RRULE:FREQ=MONTHLY;BYDAY=1MO;BYHOUR=4"

# Every 2 weeks on Saturday
schedule: "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA;BYHOUR=1"
```

### Selectors

Select which monitors are affected:

```yaml
# By labels
selector:
  matchLabels:
    environment: production
    tier: database

# By names
selector:
  names:
    - api-health
    - db-check

# By namespaces
selector:
  namespaces:
    - production
```

## Silence

Silences suppress alerts during a specific time window.

### Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Silence
metadata:
  name: incident-123
  namespace: yuptime
spec:
  startsAt: "2025-12-30T10:00:00Z"
  endsAt: "2025-12-30T14:00:00Z"
  matchers:
    - name: severity
      value: critical
      isRegex: false
  comment: "INC-123: Emergency database maintenance"
  createdBy: "incident-commander"
```

### Matchers

```yaml
matchers:
  # Exact match
  - name: team
    value: platform
    isRegex: false

  # Regex match
  - name: service
    value: "api-.*"
    isRegex: true
```

## Use Cases

### Database Maintenance

```yaml
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
      tier: database
```

### Deploy Window

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MaintenanceWindow
metadata:
  name: deploy-window
  namespace: yuptime
spec:
  schedule: "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;BYHOUR=14"
  duration: "30m"
  selector:
    matchLabels:
      environment: production
```

### Emergency Maintenance

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Silence
metadata:
  name: emergency-work
  namespace: yuptime
spec:
  startsAt: "2025-12-30T10:00:00Z"
  endsAt: "2025-12-30T14:00:00Z"
  matchers:
    - name: tier
      value: critical
      isRegex: false
  comment: "Emergency infrastructure work"
  createdBy: "ops-team"
```

### CI/CD Pipeline Silence

Create silences automatically during deployments:

```yaml
# GitHub Actions example
- name: Create silence
  run: |
    cat <<EOF | kubectl apply -f -
    apiVersion: monitoring.yuptime.io/v1
    kind: Silence
    metadata:
      name: deploy-${{ github.run_id }}
      namespace: yuptime
    spec:
      startsAt: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      endsAt: "$(date -u -d '+30 minutes' +%Y-%m-%dT%H:%M:%SZ)"
      matchers:
        - name: environment
          value: production
          isRegex: false
      comment: "Deployment ${{ github.sha }}"
      createdBy: "github-actions"
    EOF
```

## Status

### MaintenanceWindow Status

```yaml
status:
  active: false
  nextOccurrence: "2025-01-05T02:00:00Z"
  affectedMonitors:
    - api-health
    - db-check
```

### Silence Status

```yaml
status:
  state: active              # pending, active, expired
  affectedMonitors:
    - critical-api
    - payment-service
```

## Best Practices

1. **Use MaintenanceWindows for recurring events** — Don't create new Silences each week
2. **Label monitors consistently** — Makes selectors easier
3. **Document with comments** — Explain why suppression exists
4. **Clean up expired Silences** — They clutter the namespace
5. **Test selectors first** — Use `kubectl get monitors -l <labels>` to verify
