# Monitors

Monitors are the core resource in Yuptime. A monitor defines:

- the check type
- the schedule
- the target
- optional success criteria
- optional Alertmanager integration

## Basic Shape

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: my-monitor
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://example.com"
  successCriteria:
    http:
      acceptedStatusCodes: [200]
  alertmanagerUrl: "http://alertmanager.monitoring:9093/api/v1/alerts"
```

## Monitor Types

| Type | Target Key |
|------|------------|
| `http` | `target.http` |
| `tcp` | `target.tcp` |
| `dns` | `target.dns` |
| `ping` | `target.ping` |
| `websocket` | `target.websocket` |
| `grpc` | `target.grpc` |
| `mysql` | `target.mysql` |
| `postgresql` | `target.postgresql` |
| `redis` | `target.redis` |
| `k8s` | `target.kubernetes` or `target.k8s` |
| `push` | `target.push` |
| `steam` | `target.steam` |
| `keyword` | `target.http` |
| `jsonQuery` | `target.http` |
| `xmlQuery` | `target.http` |
| `htmlQuery` | `target.http` |

`docker` is currently reserved in the enum but not implemented.

## Example Patterns

### Health Endpoint

```yaml
spec:
  type: http
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    http:
      url: "https://api.example.com/health"
  successCriteria:
    http:
      acceptedStatusCodes: [200]
      latencyMsUnder: 500
```

### Database Check

```yaml
spec:
  type: postgresql
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    postgresql:
      host: "postgres.db.svc.cluster.local"
      port: 5432
      database: "myapp"
      credentialsSecretRef:
        name: db-credentials
        usernameKey: username
        passwordKey: password
```

### Kubernetes Resource

```yaml
spec:
  type: k8s
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    kubernetes:
      namespace: production
      name: my-app
      kind: Deployment
      minReadyReplicas: 3
```
