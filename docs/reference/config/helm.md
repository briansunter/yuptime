# Helm Values Reference

Complete reference for Helm chart values.

## Values Schema

```yaml
# Container images
image:
  repository: ghcr.io/briansunter/yuptime-api
  tag: latest
  digest: ""
  pullPolicy: IfNotPresent  # Always, IfNotPresent, Never

checkerImage:
  repository: ghcr.io/briansunter/yuptime-checker
  tag: latest
  digest: ""
  pullPolicy: IfNotPresent

# Application mode
mode: development  # development, production

# Logging
logging:
  level: info  # debug, info, warn, error

# Service configuration
service:
  type: ClusterIP  # ClusterIP, NodePort, LoadBalancer
  port: 3000

# Health probes
probes:
  liveness:
    enabled: true
    initialDelaySeconds: 15
    periodSeconds: 30
    timeoutSeconds: 5
    failureThreshold: 3
  readiness:
    enabled: true
    initialDelaySeconds: 10
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 2

# Resource limits
resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 100m
    memory: 256Mi

# Node selection
nodeSelector: {}
tolerations: []
affinity: {}

# Features
networkPolicy:
  enabled: true
podDisruptionBudget:
  enabled: true
  minAvailable: 1
crds:
  install: false
```

## Usage

```bash
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace \
  --set mode=production \
  --set logging.level=info
```

Or with a values file:

```bash
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace \
  -f values.yaml
```

See [Installation with Helm](/guide/installation/helm) for more details.
