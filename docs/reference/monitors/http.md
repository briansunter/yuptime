# HTTP Monitor

The HTTP monitor checks HTTP/HTTPS endpoints for availability, response codes, content, and latency.

## Basic Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: website-health
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://example.com"
      method: GET
  successCriteria:
    http:
      acceptedStatusCodes: [200]
```

## Target Configuration

### Basic Options

```yaml
target:
  http:
    url: "https://api.example.com/health"    # Required
    method: GET                               # GET, POST, PUT, DELETE, PATCH, HEAD
```

### Headers

```yaml
target:
  http:
    url: "https://api.example.com"
    method: GET
    headers:
      Accept: "application/json"
      X-Custom-Header: "value"
      X-API-Version: "2"
```

### Request Body

```yaml
target:
  http:
    url: "https://api.example.com/data"
    method: POST
    headers:
      Content-Type: "application/json"
    body: '{"key": "value", "action": "test"}'
```

### Authentication

#### Bearer Token

```yaml
target:
  http:
    url: "https://api.example.com/protected"
    method: GET
    authType: bearer
    bearerToken:
      secretRef:
        name: api-credentials
        key: token
```

#### Basic Auth

```yaml
target:
  http:
    url: "https://api.example.com/protected"
    method: GET
    authType: basic
    basicAuth:
      username: "user"
      password:
        secretRef:
          name: api-credentials
          key: password
```

#### OAuth2

```yaml
target:
  http:
    url: "https://api.example.com/protected"
    method: GET
    authType: oauth2
    oauth2:
      tokenUrl: "https://auth.example.com/oauth/token"
      clientId: "my-client-id"
      clientSecret:
        secretRef:
          name: oauth-credentials
          key: client-secret
      scopes:
        - read
        - write
```

### TLS Configuration

```yaml
target:
  http:
    url: "https://api.example.com"
    method: GET
    tls:
      skipVerify: false          # Skip certificate verification
      sni: "api.example.com"     # Server Name Indication
```

### Proxy

```yaml
target:
  http:
    url: "https://api.example.com"
    method: GET
    proxy:
      url: "http://proxy.internal:8080"
      type: http                  # http or socks5
```

### Redirects

```yaml
target:
  http:
    url: "https://example.com"
    method: GET
    maxRedirects: 5               # Max redirects to follow (0 = none)
```

### Custom DNS

```yaml
target:
  http:
    url: "https://api.example.com"
    method: GET
    dnsResolvers:
      - "8.8.8.8"
      - "1.1.1.1"
```

## Success Criteria

### Status Codes

```yaml
successCriteria:
  http:
    acceptedStatusCodes: [200, 201, 204]
```

### Latency

```yaml
successCriteria:
  http:
    acceptedStatusCodes: [200]
    maxLatencyMs: 1000            # Fail if > 1000ms
```

### Content Matching

```yaml
successCriteria:
  http:
    acceptedStatusCodes: [200]
    bodyContains: "healthy"       # Must contain
    bodyNotContains: "error"      # Must not contain
    bodyRegex: "status.*ok"       # Regex match
```

### Response Headers

```yaml
successCriteria:
  http:
    acceptedStatusCodes: [200]
    headers:
      Content-Type: "application/json"
      X-Response-Time: ".*"       # Regex supported
```

### JSON Queries

```yaml
successCriteria:
  http:
    acceptedStatusCodes: [200]
    jsonQueries:
      - path: "$.status"
        operator: equals
        value: "healthy"
      - path: "$.services[*].status"
        operator: all_equal
        value: "up"
      - path: "$.count"
        operator: greater_than
        value: "0"
```

JSON query operators:
- `equals` — Exact match
- `not_equals` — Not equal
- `contains` — Contains substring
- `greater_than` — Numeric comparison
- `less_than` — Numeric comparison
- `all_equal` — All array elements equal
- `exists` — Path exists
- `not_exists` — Path doesn't exist

## Examples

### Health Endpoint

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: api-health
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    http:
      url: "https://api.example.com/health"
      method: GET
  successCriteria:
    http:
      acceptedStatusCodes: [200]
      maxLatencyMs: 500
```

### GraphQL API

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: graphql-health
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://api.example.com/graphql"
      method: POST
      headers:
        Content-Type: "application/json"
      body: '{"query": "{ __schema { types { name } } }"}'
  successCriteria:
    http:
      acceptedStatusCodes: [200]
      jsonQueries:
        - path: "$.data.__schema"
          operator: exists
```

### Webhook Endpoint

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: webhook-health
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    http:
      url: "https://hooks.example.com/webhook"
      method: POST
      headers:
        Content-Type: "application/json"
        X-Webhook-Secret:
          secretRef:
            name: webhook-credentials
            key: secret
      body: '{"type": "health_check"}'
  successCriteria:
    http:
      acceptedStatusCodes: [200, 202]
```

### API Behind Proxy

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: internal-api
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://internal-api.corp.example.com/health"
      method: GET
      proxy:
        url: "http://corporate-proxy:3128"
        type: http
  successCriteria:
    http:
      acceptedStatusCodes: [200]
```

## Status

The monitor status includes HTTP-specific fields:

```yaml
status:
  lastCheck:
    success: true
    latencyMs: 125
    timestamp: "2025-12-30T10:00:00Z"
    message: "HTTP 200 OK"
    httpStatus: 200
  certificate:
    issuer: "Let's Encrypt Authority X3"
    expiresAt: "2026-03-15T00:00:00Z"
    daysUntilExpiry: 75
```
