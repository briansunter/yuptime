# Silence

The Silence CRD defines ad-hoc periods when alerts should be suppressed. Unlike MaintenanceWindows, Silences are one-time events with explicit start and end times.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Silence
metadata:
  name: emergency-silence
  namespace: yuptime
spec:
  startsAt: "2025-12-30T10:00:00Z"
  endsAt: "2025-12-30T12:00:00Z"
  matchers:
    - name: severity
      value: critical
      isRegex: false
  comment: "Emergency maintenance for database migration"
  createdBy: "ops-team"
```

## Spec

### `startsAt` (required)

When the silence starts (ISO 8601 format):

```yaml
startsAt: "2025-12-30T10:00:00Z"
```

### `endsAt` (required)

When the silence ends (ISO 8601 format):

```yaml
endsAt: "2025-12-30T12:00:00Z"
```

### `matchers` (required)

Selects which monitors are silenced:

```yaml
matchers:
  # Exact match
  - name: severity
    value: critical
    isRegex: false

  # Regex match
  - name: service
    value: "api-.*"
    isRegex: true

  # Label match
  - name: team
    value: platform
    isRegex: false
```

### `comment` (required)

Explanation for why this silence was created:

```yaml
comment: "Silencing alerts during planned database upgrade"
```

### `createdBy` (required)

Who created the silence:

```yaml
createdBy: "ops-team"
# or
createdBy: "john.doe@example.com"
```

## Status

```yaml
status:
  state: active              # pending, active, expired
  affectedMonitors:
    - api-health
    - db-check
  conditions:
    - type: Active
      status: "True"
      reason: "SilenceActive"
      lastTransitionTime: "2025-12-30T10:00:00Z"
```

## Silence States

| State | Description |
|-------|-------------|
| `pending` | Start time is in the future |
| `active` | Currently suppressing alerts |
| `expired` | End time has passed |

## Examples

### Emergency Silence

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
  comment: "INC-123: Emergency maintenance for database corruption"
  createdBy: "incident-commander"
```

### Deploy Silence

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Silence
metadata:
  name: deploy-2025-12-30
  namespace: yuptime
spec:
  startsAt: "2025-12-30T14:00:00Z"
  endsAt: "2025-12-30T14:30:00Z"
  matchers:
    - name: environment
      value: production
      isRegex: false
    - name: tier
      value: "api"
      isRegex: false
  comment: "Silencing during v2.5.0 deployment"
  createdBy: "deploy-pipeline"
```

### Service-Specific Silence

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Silence
metadata:
  name: payment-maintenance
  namespace: yuptime
spec:
  startsAt: "2025-12-30T02:00:00Z"
  endsAt: "2025-12-30T04:00:00Z"
  matchers:
    - name: service
      value: "payment-.*"
      isRegex: true
  comment: "Payment service maintenance and PCI compliance updates"
  createdBy: "security-team"
```

## Use Cases

### vs. MaintenanceWindow

| Use Case | Resource |
|----------|----------|
| Weekly/recurring maintenance | MaintenanceWindow |
| One-time planned work | Silence |
| Emergency/incident response | Silence |
| Deploy window | Either (Silence for one-off, MW for recurring) |

### Automation

Silences can be created automatically by CI/CD pipelines:

```yaml
# In your deployment pipeline
- name: Create deployment silence
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
      comment: "Deployment ${{ github.run_id }}"
      createdBy: "github-actions"
    EOF

- name: Deploy application
  run: kubectl rollout restart deployment/my-app

- name: Remove silence
  run: kubectl delete silence deploy-${{ github.run_id }} -n yuptime
```
