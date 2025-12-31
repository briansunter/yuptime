# Environment Variables

Environment variables for configuring Yuptime.

## Core Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Application mode | `development` |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |
| `PORT` | HTTP server port | `3000` |
| `KUBE_NAMESPACE` | Kubernetes namespace (auto-detected) | - |

## Kubernetes

| Variable | Description | Default |
|----------|-------------|---------|
| `KUBERNETES_SERVICE_HOST` | K8s API server host (auto-set in cluster) | - |
| `KUBERNETES_SERVICE_PORT` | K8s API server port (auto-set in cluster) | - |

## TLS

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_TLS_REJECT_UNAUTHORIZED` | Skip TLS verification (dev only) | `1` |

## Example ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: yuptime-config
  namespace: yuptime
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  PORT: "3000"
```

## Usage in Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: yuptime-api
spec:
  template:
    spec:
      containers:
        - name: api
          envFrom:
            - configMapRef:
                name: yuptime-config
          env:
            - name: KUBE_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
```
