# DNS Monitor

The DNS monitor checks DNS record resolution.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: dns-check
  namespace: yuptime
spec:
  type: dns
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    dns:
      server: "8.8.8.8"
      query: "example.com"
      queryType: A
  successCriteria:
    dns:
      expectedValues: ["93.184.216.34"]
```

## Target Configuration

```yaml
target:
  dns:
    server: "8.8.8.8"          # DNS server to query
    query: "example.com"        # Domain to resolve
    queryType: A                # A, AAAA, CNAME, TXT, MX, SRV
```

## Success Criteria

```yaml
successCriteria:
  dns:
    expectedValues:             # Expected results
      - "93.184.216.34"
```

## Query Types

| Type | Description |
|------|-------------|
| `A` | IPv4 address |
| `AAAA` | IPv6 address |
| `CNAME` | Canonical name |
| `TXT` | Text record |
| `MX` | Mail exchange |
| `SRV` | Service record |
