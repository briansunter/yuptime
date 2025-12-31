# MaintenanceWindow

The MaintenanceWindow CRD defines scheduled periods when alerts should be suppressed.

## Example

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

## Spec

### `schedule` (required)

An [RRULE](https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html) string defining when the maintenance window starts.

Examples:

```yaml
# Every Sunday at 2am
schedule: "RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=2"

# Every day at 3am
schedule: "RRULE:FREQ=DAILY;BYHOUR=3"

# First Monday of every month at 4am
schedule: "RRULE:FREQ=MONTHLY;BYDAY=1MO;BYHOUR=4"

# Every 2 weeks on Saturday at 1am
schedule: "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA;BYHOUR=1"
```

### `duration` (required)

How long the maintenance window lasts. Uses Go duration format:

```yaml
duration: "2h"      # 2 hours
duration: "30m"     # 30 minutes
duration: "1h30m"   # 1 hour 30 minutes
duration: "4h"      # 4 hours
```

### `selector` (required)

Selects which monitors are affected:

```yaml
# By labels
selector:
  matchLabels:
    environment: production
    team: platform

# By label expressions
selector:
  matchExpressions:
    - key: environment
      operator: In
      values: [production, staging]
    - key: critical
      operator: Exists

# By names
selector:
  names:
    - api-health
    - db-check

# By namespaces
selector:
  namespaces:
    - production
    - staging
```

### `comment` (optional)

```yaml
comment: "Weekly maintenance window for database upgrades"
```

## Status

```yaml
status:
  active: false
  nextOccurrence: "2025-01-05T02:00:00Z"
  affectedMonitors:
    - api-health
    - db-check
  conditions:
    - type: Ready
      status: "True"
      reason: "ScheduleValid"
```

## RRULE Reference

RRULE is the iCalendar recurrence rule format. Common components:

| Component | Description | Example |
|-----------|-------------|---------|
| `FREQ` | Frequency | `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` |
| `INTERVAL` | How often | `2` (every 2 weeks) |
| `BYDAY` | Day of week | `MO`, `TU`, `WE`, `TH`, `FR`, `SA`, `SU` |
| `BYHOUR` | Hour of day | `2` (2am) |
| `BYMINUTE` | Minute | `30` |
| `BYMONTHDAY` | Day of month | `1` (first day) |

### Common Patterns

```yaml
# Every night at 3am
schedule: "RRULE:FREQ=DAILY;BYHOUR=3;BYMINUTE=0"

# Every Sunday at 2am UTC
schedule: "RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=2"

# First day of each month at midnight
schedule: "RRULE:FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=0"

# Every other Saturday at 4am
schedule: "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA;BYHOUR=4"

# Quarterly on the 15th at 1am
schedule: "RRULE:FREQ=YEARLY;BYMONTH=1,4,7,10;BYMONTHDAY=15;BYHOUR=1"
```

## Examples

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
  comment: "Weekly database maintenance and backups"
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
  comment: "Bi-weekly deployment window"
```

### Quarterly Maintenance

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MaintenanceWindow
metadata:
  name: quarterly-infra
  namespace: yuptime
spec:
  schedule: "RRULE:FREQ=YEARLY;BYMONTH=1,4,7,10;BYDAY=1SA;BYHOUR=0"
  duration: "8h"
  selector:
    matchLabels:
      tier: infrastructure
  comment: "Quarterly infrastructure maintenance"
```
