# DNS Monitor

Checks DNS resolution for a name and record type.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: website-dns
  namespace: yuptime
spec:
  type: dns
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    dns:
      name: "example.com"
      recordType: A
      expected:
        values:
          - "93.184.216.34"
```

## Target Shape

```yaml
target:
  dns:
    name: "example.com"
    recordType: A
    expected:
      values:
        - "93.184.216.34"
```

Supported `recordType` values are `A`, `AAAA`, `CNAME`, `TXT`, `MX`, and `SRV`.

## Notes

- Expected values are optional. If omitted, any non-empty DNS answer is treated as success.
- The current checker uses the runtime resolver path rather than a per-monitor nameserver override.
- Use `http`, `tcp`, or `grpc` monitors when you need protocol-level validation after resolution.
