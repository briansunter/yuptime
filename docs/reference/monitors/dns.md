# DNS Monitor

Checks DNS record resolution and validates expected values.

## Basic Example

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
    server: "8.8.8.8"           # Required: DNS server
    port: 53                     # Optional: port (default: 53)
    query: "example.com"         # Required: domain to resolve
    queryType: A                 # Required: record type
    protocol: udp                # Optional: udp or tcp
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `server` | Yes | - | DNS server IP |
| `query` | Yes | - | Domain to resolve |
| `queryType` | Yes | - | Record type |
| `protocol` | No | `udp` | Transport protocol |

## Query Types

| Type | Description |
|------|-------------|
| `A` | IPv4 address |
| `AAAA` | IPv6 address |
| `CNAME` | Canonical name |
| `TXT` | Text record |
| `MX` | Mail exchange |
| `SRV` | Service record |

## Success Criteria

```yaml
successCriteria:
  dns:
    expectedValues: ["93.184.216.34"]
    minResults: 1
```

## Examples

### A Record

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
      server: "8.8.8.8"
      query: "www.example.com"
      queryType: A
  successCriteria:
    dns:
      expectedValues: ["93.184.216.34"]
```

### MX Record

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: email-mx
  namespace: yuptime
spec:
  type: dns
  schedule:
    intervalSeconds: 300
    timeoutSeconds: 10
  target:
    dns:
      server: "1.1.1.1"
      query: "example.com"
      queryType: MX
  successCriteria:
    dns:
      minResults: 1
```

### Kubernetes CoreDNS

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: k8s-dns
  namespace: yuptime
spec:
  type: dns
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 5
  target:
    dns:
      server: "kube-dns.kube-system.svc.cluster.local"
      query: "kubernetes.default.svc.cluster.local"
      queryType: A
  successCriteria:
    dns:
      minResults: 1
```

## Common DNS Servers

| Provider | Address |
|----------|---------|
| Google | `8.8.8.8` |
| Cloudflare | `1.1.1.1` |
| Quad9 | `9.9.9.9` |

## Troubleshooting

**Timeout**: DNS server unreachable or blocked by firewall
**NXDOMAIN**: Domain doesn't exist or typo in query
**Unexpected values**: Record changed or using cached data
