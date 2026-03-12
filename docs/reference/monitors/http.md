# HTTP Monitor

HTTP monitors check HTTP or HTTPS endpoints for status code and latency. Use `keyword`, `jsonQuery`, `xmlQuery`, or `htmlQuery` when you need body-level validation beyond the basic HTTP result.

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

## Headers

```yaml
target:
  http:
    url: "https://api.example.com"
    headers:
      - name: Accept
        value: application/json
      - name: X-API-Version
        value: "2"
```

## Request Body

```yaml
target:
  http:
    url: "https://api.example.com/data"
    method: POST
    body:
      type: json
      json:
        action: test
```

## Authentication

### Bearer Token

```yaml
target:
  http:
    url: "https://api.example.com/protected"
    auth:
      bearer:
        tokenSecretRef:
          name: api-credentials
          key: token
```

### Basic Auth

```yaml
target:
  http:
    url: "https://api.example.com/protected"
    auth:
      basic:
        secretRef:
          name: api-credentials
          usernameKey: username
          passwordKey: password
```

### OAuth2 Client Credentials

```yaml
target:
  http:
    url: "https://api.example.com/protected"
    auth:
      oauth2:
        tokenUrl: "https://auth.example.com/oauth/token"
        clientSecretRef:
          name: oauth-credentials
          clientIdKey: client_id
          clientSecretKey: client_secret
        scopes:
          - read
```

## TLS

```yaml
target:
  http:
    url: "https://api.example.com"
    tls:
      verify: true
      sni: "api.example.com"
```

## Proxy

```yaml
target:
  http:
    url: "https://api.example.com"
    proxy:
      mode: http
      urlFromSecretRef:
        name: http-proxy
        key: url
```

## Success Criteria

```yaml
successCriteria:
  http:
    acceptedStatusCodes: [200, 201, 204]
    latencyMsUnder: 1000
```

For JSON, XML, HTML, or keyword matching, switch the monitor type to `jsonQuery`, `xmlQuery`, `htmlQuery`, or `keyword`.
