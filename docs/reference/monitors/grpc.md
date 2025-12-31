# gRPC Monitor

Performs health checks using the standard [gRPC health checking protocol](https://github.com/grpc/grpc/blob/master/doc/health-checking.md).

## Basic Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: grpc-service
  namespace: yuptime
spec:
  type: grpc
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    grpc:
      host: "api.default.svc.cluster.local"
      port: 50051
```

## Target Configuration

```yaml
target:
  grpc:
    host: "grpc-service.example.com"   # Required: server host
    port: 50051                         # Required: server port
    service: ""                         # Optional: service name (empty = server health)
    tls:
      enabled: false                    # Enable TLS
      skipVerify: false                 # Skip certificate verification
      sni: "grpc-service.example.com"   # Server Name Indication
    metadata:                           # Optional: gRPC metadata
      authorization: "Bearer token"
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `host` | Yes | - | Server hostname or IP |
| `port` | Yes | - | Server port |
| `service` | No | `""` | Service name to check |
| `tls.enabled` | No | `false` | Enable TLS |
| `tls.skipVerify` | No | `false` | Skip TLS verification |

## Health Status Mapping

| gRPC Status | Result |
|-------------|--------|
| `SERVING` | Healthy |
| `NOT_SERVING` | Unhealthy |
| `SERVICE_UNKNOWN` | Unhealthy |

## Examples

### Specific Service

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: user-service
  namespace: yuptime
spec:
  type: grpc
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    grpc:
      host: "user-service.production.svc.cluster.local"
      port: 50051
      service: "users.v1.UserService"
```

### With TLS

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: secure-grpc
  namespace: yuptime
spec:
  type: grpc
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 15
  target:
    grpc:
      host: "api.example.com"
      port: 443
      tls:
        enabled: true
```

### With Alerting

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: payment-grpc
  namespace: yuptime
spec:
  type: grpc
  schedule:
    intervalSeconds: 15
    timeoutSeconds: 5
  target:
    grpc:
      host: "payment.production.svc.cluster.local"
      port: 50051
      service: "payments.v1.PaymentService"
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: critical
```

## Service Implementation

Your service must implement the gRPC health protocol:

```go
import "google.golang.org/grpc/health"

healthServer := health.NewServer()
healthpb.RegisterHealthServer(server, healthServer)
healthServer.SetServingStatus("my.Service", healthpb.HealthCheckResponse_SERVING)
```

## Troubleshooting

**Connection refused**: Check service is running and port is correct
```bash
kubectl get pods -l app=grpc-service
grpcurl -plaintext service:50051 list
```

**Service unknown**: Verify service name matches registered services
```bash
grpcurl -plaintext service:50051 grpc.health.v1.Health/Check
```
