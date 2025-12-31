# Redis Monitor

Checks Redis connectivity using the PING command.

## Basic Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: redis-health
  namespace: yuptime
spec:
  type: redis
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 5
  target:
    redis:
      host: "redis.cache.svc.cluster.local"
      port: 6379
```

## Target Configuration

```yaml
target:
  redis:
    host: "redis.example.com"           # Required: server host
    port: 6379                           # Optional: port (default: 6379)
    database: 0                          # Optional: database 0-15 (default: 0)
    credentialsSecretRef:
      name: redis-credentials
      passwordKey: password              # Optional (default: "password")
    tls:
      enabled: false                     # Optional: enable TLS
```

## Credentials Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: redis-credentials
  namespace: yuptime
type: Opaque
stringData:
  password: your_redis_password
```

## Examples

### Without Authentication

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: redis-cache
  namespace: yuptime
spec:
  type: redis
  schedule:
    intervalSeconds: 15
    timeoutSeconds: 5
  target:
    redis:
      host: "redis.cache.svc.cluster.local"
      port: 6379
```

### With Authentication

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: redis-auth
  namespace: yuptime
spec:
  type: redis
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 5
  target:
    redis:
      host: "redis.cache.svc.cluster.local"
      port: 6379
      credentialsSecretRef:
        name: redis-credentials
```

### ElastiCache with TLS

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: elasticache
  namespace: yuptime
spec:
  type: redis
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    redis:
      host: "cluster.xxxx.cache.amazonaws.com"
      port: 6379
      credentialsSecretRef:
        name: elasticache-credentials
      tls:
        enabled: true
```

### With Alerting

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: redis-production
  namespace: yuptime
spec:
  type: redis
  schedule:
    intervalSeconds: 15
    timeoutSeconds: 5
  target:
    redis:
      host: "redis.production.svc.cluster.local"
      credentialsSecretRef:
        name: redis-credentials
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: critical
```

## Troubleshooting

**Connection refused**: Redis not running or wrong host/port
**NOAUTH Authentication required**: Password needed but not provided
**Invalid DB index**: Database number must be 0-15
