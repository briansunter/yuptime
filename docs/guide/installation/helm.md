# Installing with Helm

Helm is the most widely used Kubernetes package manager. Yuptime publishes Helm charts to GitHub Container Registry (GHCR).

## Prerequisites

- Kubernetes cluster (1.26+)
- kubectl configured
- Helm 3.x installed

## Install Helm

::: code-group

```bash [macOS]
brew install helm
```

```bash [Linux]
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

```bash [Windows]
choco install kubernetes-helm
```

:::

Verify installation:

```bash
helm version
```

## Quick Install

Install Yuptime with default settings:

```bash
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace
```

## Custom Installation

### Using --set Flags

```bash
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace \
  --set mode=production \
  --set logging.level=info \
  --set crds.install=true
```

### Using a Values File

Create a `values.yaml` file:

```yaml
# Container images
image:
  repository: ghcr.io/briansunter/yuptime-api
  tag: latest
  pullPolicy: Always

checkerImage:
  repository: ghcr.io/briansunter/yuptime-checker
  tag: latest
  pullPolicy: Always

# Application mode
mode: production

# Logging
logging:
  level: info

# Service configuration
service:
  type: ClusterIP
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

# Install CRDs
crds:
  install: true

# Network policy
networkPolicy:
  enabled: true

# Pod disruption budget
podDisruptionBudget:
  enabled: true
  minAvailable: 1
```

Install with values file:

```bash
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace \
  -f values.yaml
```

## Values Reference

### Image Configuration

```yaml
image:
  repository: ghcr.io/briansunter/yuptime-api
  tag: latest                # or specific version like "0.0.18"
  digest: ""                 # optional: pin by digest
  pullPolicy: Always         # Always, IfNotPresent, Never

checkerImage:
  repository: ghcr.io/briansunter/yuptime-checker
  tag: latest
  digest: ""
  pullPolicy: Always
```

### Mode and Logging

```yaml
mode: production             # production or development

logging:
  level: info                # debug, info, warn, error
```

### Service Configuration

```yaml
service:
  type: ClusterIP            # ClusterIP, NodePort, LoadBalancer
  port: 3000
  annotations: {}
```

### Ingress

```yaml
ingress:
  enabled: false
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: yuptime.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: yuptime-tls
      hosts:
        - yuptime.example.com
```

### Resource Limits

```yaml
resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 100m
    memory: 256Mi
```

### Node Selection

```yaml
nodeSelector:
  kubernetes.io/os: linux

tolerations:
  - key: node-role.kubernetes.io/control-plane
    operator: Exists
    effect: NoSchedule

affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/os
              operator: In
              values:
                - linux
```

### Probes

```yaml
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
```

## GitOps with Flux

Create a HelmRelease for Flux:

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: yuptime
  namespace: flux-system
spec:
  type: oci
  interval: 5m
  url: oci://ghcr.io/briansunter/yuptime/charts
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: yuptime
  namespace: yuptime
spec:
  interval: 5m
  chart:
    spec:
      chart: yuptime
      version: ">=0.0.18"
      sourceRef:
        kind: HelmRepository
        name: yuptime
        namespace: flux-system
  values:
    mode: production
    logging:
      level: info
```

## Upgrading

```bash
# Upgrade with new values
helm upgrade yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  -f values.yaml

# Upgrade reusing existing values
helm upgrade yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --reuse-values

# Upgrade to specific version
helm upgrade yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --version 0.0.19
```

## Uninstalling

```bash
helm uninstall yuptime --namespace yuptime

# Delete namespace
kubectl delete namespace yuptime

# Delete CRDs (optional, removes all monitors!)
kubectl delete crds \
  monitors.monitoring.yuptime.io \
  monitorsets.monitoring.yuptime.io \
  maintenancewindows.monitoring.yuptime.io \
  silences.monitoring.yuptime.io \
  yuptimesettings.monitoring.yuptime.io
```

## Troubleshooting

### View Generated Manifest

```bash
helm template yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  -f values.yaml
```

### Debug Installation

```bash
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace \
  --debug \
  --dry-run
```

### Check Release Status

```bash
helm status yuptime --namespace yuptime
helm history yuptime --namespace yuptime
```
