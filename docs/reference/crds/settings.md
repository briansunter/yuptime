# YuptimeSettings

The YuptimeSettings CRD is a cluster-scoped resource that configures global Yuptime behavior.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: YuptimeSettings
metadata:
  name: default
spec:
  mode:
    gitOpsReadOnly: true
    singleInstanceRequired: true
  scheduler:
    defaultInterval: 60
    minInterval: 10
    maxConcurrentChecks: 100
    jitterWindow: 30
    flappingDetection:
      enabled: true
      threshold: 3
      window: 300
  networking:
    userAgent: "Yuptime/1.0"
    dnsResolvers:
      - "8.8.8.8"
      - "8.8.4.4"
    pingMode: icmp
```

## Spec

### `mode` (optional)

Global operational mode settings:

```yaml
mode:
  gitOpsReadOnly: true        # Never modify spec (GitOps mode)
  singleInstanceRequired: true # Ensure only one scheduler runs
```

### `scheduler` (optional)

Scheduler configuration:

```yaml
scheduler:
  defaultInterval: 60          # Default check interval (seconds)
  minInterval: 10              # Minimum allowed interval
  maxConcurrentChecks: 100     # Max simultaneous checks
  jitterWindow: 30             # Jitter window (seconds)
  flappingDetection:
    enabled: true              # Detect flapping monitors
    threshold: 3               # State changes before marking as flapping
    window: 300                # Time window (seconds)
```

### `networking` (optional)

Network configuration:

```yaml
networking:
  userAgent: "Yuptime/1.0"     # HTTP User-Agent header
  dnsResolvers:                # Custom DNS resolvers
    - "8.8.8.8"
    - "8.8.4.4"
  pingMode: icmp               # icmp or tcp
  httpTimeout: 30              # Default HTTP timeout
```

### `alerting` (optional)

Global alerting configuration:

```yaml
alerting:
  defaultAlertmanagerUrl: "http://alertmanager.monitoring:9093"
  defaultLabels:
    cluster: production
```

### `retention` (optional)

Data retention settings:

```yaml
retention:
  checkResults: 30d            # How long to keep check results
  jobs: 1h                     # How long to keep completed jobs
```

## Scope

YuptimeSettings is **cluster-scoped** — there should be only one instance named `default`:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: YuptimeSettings
metadata:
  name: default    # Always "default"
# No namespace field
spec:
  # ...
```

## Status

```yaml
status:
  observedGeneration: 1
  conditions:
    - type: Ready
      status: "True"
      reason: "ConfigurationValid"
      message: "Settings applied successfully"
```

## Field Reference

### Scheduler Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `defaultInterval` | int | 60 | Default check interval in seconds |
| `minInterval` | int | 10 | Minimum allowed interval |
| `maxConcurrentChecks` | int | 100 | Maximum simultaneous checks |
| `jitterWindow` | int | 30 | Jitter window in seconds |
| `flappingDetection.enabled` | bool | true | Enable flapping detection |
| `flappingDetection.threshold` | int | 3 | State changes before flapping |
| `flappingDetection.window` | int | 300 | Flapping detection window (seconds) |

### Networking Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `userAgent` | string | "Yuptime/1.0" | HTTP User-Agent header |
| `dnsResolvers` | []string | system | Custom DNS resolvers |
| `pingMode` | string | "icmp" | Ping mode: icmp or tcp |
| `httpTimeout` | int | 30 | Default HTTP timeout |

### Mode Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `gitOpsReadOnly` | bool | true | Never modify CRD specs |
| `singleInstanceRequired` | bool | true | Enforce single scheduler |

## Best Practices

1. **Create early** — Apply YuptimeSettings before creating monitors
2. **Use GitOps mode** — Keep `gitOpsReadOnly: true` for production
3. **Tune jitter** — Adjust `jitterWindow` based on number of monitors
4. **Set DNS resolvers** — Use reliable resolvers for consistent results
