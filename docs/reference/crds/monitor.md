# Monitor

The Monitor CRD defines a single health check. It's the core resource in Yuptime.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: my-api
  namespace: yuptime
  labels:
    team: platform
    environment: production
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://api.example.com/health"
      method: GET
  successCriteria:
    http:
      acceptedStatusCodes: [200, 201]
  alerting:
    alertmanagerUrl: "http://alertmanager.monitoring:9093"
    labels:
      severity: critical
```

## Spec

### `type` (required)

The type of monitor. Determines which target and successCriteria fields are used.

| Type | Description |
|------|-------------|
| `http` | HTTP/HTTPS endpoint |
| `tcp` | TCP port connectivity |
| `dns` | DNS record query |
| `ping` | ICMP ping |
| `websocket` | WebSocket connection |
| `grpc` | gRPC health check |
| `mysql` | MySQL database |
| `postgresql` | PostgreSQL database |
| `redis` | Redis cache |
| `kubernetes` | Kubernetes resource |
| `push` | Push-based (webhook receiver) |
| `steam` | Steam game server |
| `keyword` | HTTP with content matching |
| `jsonQuery` | HTTP with JSON validation |
| `xmlQuery` | HTTP with XPath validation |
| `htmlQuery` | HTTP with CSS selector validation |

### `schedule` (required)

```yaml
schedule:
  intervalSeconds: 60      # How often to run the check (required)
  timeoutSeconds: 30       # How long to wait before timeout (required)
```

### `target` (required)

Target configuration varies by monitor type. See [Monitor Types](/reference/monitors/http) for details.

### `successCriteria` (optional)

Defines what constitutes a successful check. Varies by monitor type.

### `alerting` (optional)

```yaml
alerting:
  alertmanagerUrl: "http://alertmanager:9093"  # Alertmanager endpoint
  labels:                                        # Labels for alerts
    severity: critical
    team: platform
```

### `tags` (optional)

```yaml
tags:
  - production
  - critical
  - api
```

### `description` (optional)

```yaml
description: "Health check for the main API endpoint"
```

## Status

The controller and checker pods update the status subresource:

```yaml
status:
  # Current state
  state: healthy              # healthy, unhealthy, degraded, unknown

  # Last check result
  lastCheck:
    timestamp: "2025-12-30T10:00:00Z"
    success: true
    latencyMs: 125
    message: "HTTP 200 OK"

  # Uptime statistics
  uptime:
    last24h: 99.95
    last7d: 99.98
    last30d: 99.99

  # Certificate info (for HTTPS monitors)
  certificate:
    issuer: "Let's Encrypt Authority X3"
    expiresAt: "2026-03-15T00:00:00Z"
    daysUntilExpiry: 75

  # Conditions (Kubernetes-style)
  conditions:
    - type: Ready
      status: "True"
      lastTransitionTime: "2025-12-30T10:00:00Z"
      reason: "CheckPassed"
      message: "Monitor is healthy"
```

## Full Reference

### HTTP Target

```yaml
target:
  http:
    url: "https://api.example.com/health"
    method: GET                    # GET, POST, PUT, DELETE, PATCH, HEAD
    headers:                       # Custom headers
      X-Custom-Header: "value"
    body: '{"key": "value"}'       # Request body
    authType: bearer               # none, basic, bearer, oauth2
    basicAuth:                     # For authType: basic
      username: "user"
      password:
        secretRef:
          name: api-credentials
          key: password
    bearerToken:                   # For authType: bearer
      secretRef:
        name: api-credentials
        key: token
    oauth2:                        # For authType: oauth2
      tokenUrl: "https://auth.example.com/token"
      clientId: "client-id"
      clientSecret:
        secretRef:
          name: oauth-credentials
          key: secret
      scopes: ["read", "write"]
    tls:
      skipVerify: false            # Skip TLS verification
      sni: "api.example.com"       # Server Name Indication
    proxy:
      url: "http://proxy:8080"
      type: http                   # http, socks5
    maxRedirects: 5
    dnsResolvers: ["8.8.8.8"]
```

### HTTP Success Criteria

```yaml
successCriteria:
  http:
    acceptedStatusCodes: [200, 201, 204]
    maxLatencyMs: 1000
    bodyContains: "healthy"
    bodyNotContains: "error"
    bodyRegex: "status.*ok"
    jsonQueries:
      - path: "$.status"
        operator: equals
        value: "ok"
    headers:
      Content-Type: "application/json"
```

### TCP Target

```yaml
target:
  tcp:
    host: "db.example.com"
    port: 5432
    send: "PING\n"                 # Optional: data to send
    expect: "PONG"                 # Optional: expected response
    tls:
      enabled: false
      skipVerify: false
      sni: "db.example.com"
```

### DNS Target

```yaml
target:
  dns:
    server: "8.8.8.8"
    query: "example.com"
    queryType: A                   # A, AAAA, CNAME, TXT, MX, SRV
```

### DNS Success Criteria

```yaml
successCriteria:
  dns:
    expectedValues: ["93.184.216.34"]
```

### Ping Target

```yaml
target:
  ping:
    host: "example.com"
    count: 3                       # Number of packets
    mode: icmp                     # icmp, tcp
```

### gRPC Target

```yaml
target:
  grpc:
    host: "my-service.default.svc.cluster.local"
    port: 50051
    service: "grpc.health.v1.Health"
    useTLS: false
    skipVerify: false
```

### MySQL Target

```yaml
target:
  mysql:
    host: "mysql.database.svc.cluster.local"
    port: 3306
    database: "myapp"
    user: "monitor"
    password:
      secretRef:
        name: mysql-credentials
        key: password
    query: "SELECT 1"              # Health check query
    tls:
      enabled: false
```

### PostgreSQL Target

```yaml
target:
  postgresql:
    host: "postgres.database.svc.cluster.local"
    port: 5432
    database: "myapp"
    user: "monitor"
    password:
      secretRef:
        name: postgres-credentials
        key: password
    query: "SELECT 1"
    sslMode: prefer                # disable, prefer, require, verify-ca, verify-full
```

### Redis Target

```yaml
target:
  redis:
    host: "redis.cache.svc.cluster.local"
    port: 6379
    database: 0                    # Database number (0-15)
    password:
      secretRef:
        name: redis-credentials
        key: password
    tls:
      enabled: false
```

### Kubernetes Target

```yaml
target:
  kubernetes:
    kind: Deployment               # Deployment, StatefulSet, DaemonSet, Pod, Service
    name: my-app
    namespace: production
    expectedReplicas: 3            # For Deployment/StatefulSet
```

### Push Target

```yaml
target:
  push:
    token:
      secretRef:
        name: push-token
        key: token
    gracePeriodSeconds: 300        # How long to wait before marking unhealthy
```

### Steam Target

```yaml
target:
  steam:
    host: "game-server.example.com"
    port: 27015
```

## Labels and Selectors

Monitors can be selected by label for:
- MaintenanceWindows
- Silences
- MonitorSets

```yaml
metadata:
  labels:
    team: platform
    environment: production
    tier: critical
```

Select monitors:

```yaml
# MaintenanceWindow
spec:
  selector:
    matchLabels:
      environment: production
```
