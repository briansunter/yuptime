# Ping Monitor

Checks host reachability using ICMP echo requests.

## Basic Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: gateway-ping
  namespace: yuptime
spec:
  type: ping
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    ping:
      host: "192.168.1.1"
      packetCount: 3
```

## Target Configuration

```yaml
target:
  ping:
    host: "192.168.1.1"      # Required: IP or hostname
    packetCount: 3            # Optional: packets to send (default: 1)
```

## Examples

### Network Gateway

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: router-health
  namespace: yuptime
spec:
  type: ping
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    ping:
      host: "10.0.0.1"
      packetCount: 5
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: critical
```

### External Host

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: dns-server-ping
  namespace: yuptime
spec:
  type: ping
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 15
  target:
    ping:
      host: "8.8.8.8"
      packetCount: 3
```

## Notes

- Platform-aware: Works on Linux, macOS, and Windows
- Returns latency from ping output
- Host unreachable and packet loss are reported as failures
- Consider using TCP or HTTP monitors for application-level checks
