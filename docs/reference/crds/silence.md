# Silence

`Silence` mutes alerts until a fixed expiration time.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Silence
metadata:
  name: emergency-silence
  namespace: yuptime
spec:
  expiresAt: "2026-03-16T12:00:00Z"
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
  reason: "Emergency maintenance for database migration"
```

## Spec

### `spec.expiresAt`

UTC timestamp when the silence stops applying.

### `spec.match`

Select monitors by exact name references, namespaces, labels, or tags.

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

### `spec.reason`

Optional free-form explanation for the silence.

## Status

```yaml
status:
  observedGeneration: 1
  isActive: true
  expiresIn: "1h30m"
  affectedCount: 4
  conditions:
    - type: Ready
      status: "True"
      reason: "SilenceActive"
      lastTransitionTime: "2026-03-15T10:00:00Z"
```

## Examples

### Incident Response

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
  reason: "INC-123 mitigation in progress"
```

### Deployment Mute

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Silence
metadata:
  name: deploy-2026-03-15
  namespace: yuptime
spec:
  expiresAt: "2026-03-15T14:30:00Z"
  match:
    tags:
      - production
      - api
  reason: "Temporary mute during rollout"
```

## Notes

- Use `Silence` for one-off events.
- Use `MaintenanceWindow` for recurring periods.
- `expiresAt` must be in the future when the resource is created.
