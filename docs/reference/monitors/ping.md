# Ping Monitor

The ping monitor performs ICMP echo requests to check host reachability.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: ping-check
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
    host: "192.168.1.1"      # Host to ping (IP or hostname)
    packetCount: 1           # Number of ICMP packets to send (default: 1)
```

## Notes

- Platform-aware: Works on Linux, macOS, and Windows
- Returns latency extracted from ping output
- Host unreachable and packet loss are reported as failures
