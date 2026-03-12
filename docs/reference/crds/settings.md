# YuptimeSettings

`YuptimeSettings` is the single cluster-scoped settings object for Yuptime.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: YuptimeSettings
metadata:
  name: yuptime
spec:
  mode:
    gitOpsReadOnly: true
    singleInstanceRequired: true
  scheduler:
    minIntervalSeconds: 20
    maxConcurrentNetChecks: 200
    maxConcurrentPrivChecks: 20
    defaultTimeoutSeconds: 10
    jitterPercent: 5
    flapping:
      enabled: true
      toggleThreshold: 6
      windowMinutes: 10
      suppressNotificationsMinutes: 30
  networking:
    userAgent: "Yuptime/1.0"
    dns:
      resolvers:
        - "8.8.8.8"
        - "1.1.1.1"
      timeoutSeconds: 5
    ping:
      mode: tcpFallback
      tcpFallbackPort: 443
```

## Scope

`YuptimeSettings` is cluster-scoped. The authoritative object name is `yuptime`, and the resource has no namespace.

## Spec

### `spec.mode`

```yaml
mode:
  gitOpsReadOnly: true
  singleInstanceRequired: true
```

### `spec.scheduler`

```yaml
scheduler:
  minIntervalSeconds: 20
  maxConcurrentNetChecks: 200
  maxConcurrentPrivChecks: 20
  defaultTimeoutSeconds: 10
  jitterPercent: 5
  flapping:
    enabled: true
    toggleThreshold: 6
    windowMinutes: 10
    suppressNotificationsMinutes: 30
```

### `spec.networking`

```yaml
networking:
  userAgent: "Yuptime/1.0"
  dns:
    resolvers:
      - "8.8.8.8"
      - "1.1.1.1"
    timeoutSeconds: 5
  ping:
    mode: tcpFallback
    tcpFallbackPort: 443
```

## Status

```yaml
status:
  observedGeneration: 1
  lastValidation: "2026-03-15T10:00:00Z"
  conditions:
    - type: Ready
      status: "True"
      reason: "ConfigurationValid"
      lastTransitionTime: "2026-03-15T10:00:00Z"
```

## Notes

- Create `YuptimeSettings` before large monitor rollouts so global defaults are in place.
- Keep `gitOpsReadOnly: true` unless you explicitly need mutable control-plane behavior.
- Prefer a small `jitterPercent` instead of overly long intervals when spreading load.
