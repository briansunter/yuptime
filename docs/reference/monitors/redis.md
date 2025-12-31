# Redis Monitor

The Redis monitor checks cache/database connectivity using the PING command.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: redis-check
  namespace: yuptime
spec:
  type: redis
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 5
  target:
    redis:
      host: "redis.default.svc.cluster.local"
      port: 6379
```

## Target Configuration

```yaml
target:
  redis:
    host: "redis.example.com"          # Redis server host
    port: 6379                          # Redis port (default: 6379)
    database: 0                         # Redis database number 0-15 (default: 0)
    credentialsSecretRef:               # Optional authentication
      name: redis-credentials
      passwordKey: password             # Key for password (default: "password")
    tls:
      enabled: false                    # Enable TLS (default: false)
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
  password: myredispassword
```

## Notes

- Uses Redis PING command to verify connectivity
- Authentication is optional for Redis instances without AUTH
- Supports database selection (0-15)
