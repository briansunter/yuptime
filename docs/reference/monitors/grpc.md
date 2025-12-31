# gRPC Monitor

The gRPC monitor performs health checks using the standard gRPC health checking protocol.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: grpc-check
  namespace: yuptime
spec:
  type: grpc
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    grpc:
      host: "grpc-service.default.svc.cluster.local"
      port: 50051
      service: "my.service.Name"
```

## Target Configuration

```yaml
target:
  grpc:
    host: "grpc-service.example.com"   # gRPC server host
    port: 50051                         # gRPC server port (default: 50051)
    service: "my.service.Name"          # Service name to check (default: "" for server health)
    tls:
      enabled: false                    # Enable TLS (default: false)
      verify: true                      # Verify TLS certificates (default: true)
    dns:                                # Optional DNS configuration
      useSystemResolver: false
      resolvers: ["8.8.8.8"]
```

## Health Status

The monitor checks against the gRPC health protocol status:

| Status | Result |
|--------|--------|
| `SERVING` | Up |
| `NOT_SERVING` | Down |
| `SERVICE_UNKNOWN` | Down |
| `UNKNOWN` | Down |
