# Installing with Timoni

[Timoni](https://timoni.sh) is a CUE-based Kubernetes package manager. It's the recommended way to install Yuptime because it provides the most flexibility and best GitOps integration.

## Prerequisites

- Kubernetes cluster (1.26+)
- kubectl configured
- Timoni CLI installed

## Install Timoni

::: code-group

```bash [macOS]
brew install stefanprodan/tap/timoni
```

```bash [Linux]
curl -Lo timoni.tar.gz https://github.com/stefanprodan/timoni/releases/latest/download/timoni_$(uname -s)_$(uname -m).tar.gz
tar -xzf timoni.tar.gz timoni
sudo mv timoni /usr/local/bin/
```

```bash [Windows]
scoop install timoni
```

:::

Verify installation:

```bash
timoni version
```

## Quick Install

Install Yuptime with default settings:

```bash
timoni apply yuptime oci://ghcr.io/briansunter/yuptime/timoni-module \
  --version latest \
  --namespace yuptime
```

## Custom Installation

### 1. Create Values File

Create a `values.cue` file with your configuration:

```cue
values: {
  // Container images
  image: {
    repository: "ghcr.io/briansunter/yuptime-api"
    tag:        "latest"
    pullPolicy: "Always"
  }

  checkerImage: {
    repository: "ghcr.io/briansunter/yuptime-checker"
    tag:        "latest"
    pullPolicy: "Always"
  }

  // Application mode
  mode: "production"

  // Logging
  logging: level: "info"

  // Service configuration
  service: {
    type: "ClusterIP"
    port: 3000
  }

  // Health probes
  probes: {
    liveness: {
      enabled:             true
      initialDelaySeconds: 15
      periodSeconds:       30
      timeoutSeconds:      5
      failureThreshold:    3
    }
    readiness: {
      enabled:             true
      initialDelaySeconds: 10
      periodSeconds:       10
      timeoutSeconds:      5
      failureThreshold:    2
    }
  }

  // Install CRDs
  crds: install: true

  // Network policy
  networkPolicy: enabled: true

  // Pod disruption budget
  podDisruptionBudget: {
    enabled:      true
    minAvailable: 1
  }
}
```

### 2. Apply

```bash
timoni apply yuptime oci://ghcr.io/briansunter/yuptime/timoni-module \
  --version latest \
  --namespace yuptime \
  -f values.cue
```

## Values Reference

### Image Configuration

```cue
values: {
  image: {
    repository: "ghcr.io/briansunter/yuptime-api"
    tag:        "latest"      // or specific version like "0.0.18"
    digest:     ""            // optional: pin by digest
    pullPolicy: "Always"      // Always, IfNotPresent, Never
  }

  checkerImage: {
    repository: "ghcr.io/briansunter/yuptime-checker"
    tag:        "latest"
    digest:     ""
    pullPolicy: "Always"
  }
}
```

### Mode and Logging

```cue
values: {
  mode: "production"          // production or development

  logging: level: "info"      // debug, info, warn, error
}
```

### Probes

```cue
values: {
  probes: {
    liveness: {
      enabled:             true
      initialDelaySeconds: 15
      periodSeconds:       30
      timeoutSeconds:      5
      failureThreshold:    3
    }
    readiness: {
      enabled:             true
      initialDelaySeconds: 10
      periodSeconds:       10
      timeoutSeconds:      5
      failureThreshold:    2
    }
  }
}
```

### CRDs and Features

```cue
values: {
  crds: install: true                   // Install CRDs (set false if pre-installed)
  networkPolicy: enabled: true          // Create NetworkPolicy
  podDisruptionBudget: {
    enabled:      true
    minAvailable: 1
  }
}
```

### Resource Limits

```cue
values: {
  resources: {
    limits: {
      cpu:    "1000m"
      memory: "1Gi"
    }
    requests: {
      cpu:    "100m"
      memory: "256Mi"
    }
  }
}
```

### Node Selection

```cue
values: {
  nodeSelector: {
    "kubernetes.io/os": "linux"
  }

  tolerations: [{
    key:      "node-role.kubernetes.io/control-plane"
    operator: "Exists"
    effect:   "NoSchedule"
  }]

  affinity: nodeAffinity: requiredDuringSchedulingIgnoredDuringExecution: nodeSelectorTerms: [{
    matchExpressions: [{
      key:      "kubernetes.io/os"
      operator: "In"
      values: ["linux"]
    }]
  }]
}
```

## GitOps with Flux

Create a Timoni instance for Flux:

```yaml
# yuptime-instance.yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: OCIRepository
metadata:
  name: yuptime
  namespace: flux-system
spec:
  interval: 5m
  url: oci://ghcr.io/briansunter/yuptime/timoni-module
  ref:
    tag: latest
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: yuptime
  namespace: flux-system
spec:
  interval: 5m
  targetNamespace: yuptime
  sourceRef:
    kind: OCIRepository
    name: yuptime
  path: ./
  prune: true
  wait: true
```

## Upgrading

```bash
# Upgrade to a new version
timoni apply yuptime oci://ghcr.io/briansunter/yuptime/timoni-module \
  --version 0.0.19 \
  --namespace yuptime \
  -f values.cue
```

## Uninstalling

```bash
timoni delete yuptime --namespace yuptime
```

## Troubleshooting

### Module Pull Errors

If you can't pull the module:

```bash
# Check if you can access GHCR
timoni mod list oci://ghcr.io/briansunter/yuptime/timoni-module
```

### Validation Errors

Validate your values file before applying:

```bash
timoni build yuptime oci://ghcr.io/briansunter/yuptime/timoni-module \
  --version latest \
  -f values.cue
```

### Dry Run

See what would be applied without actually applying:

```bash
timoni apply yuptime oci://ghcr.io/briansunter/yuptime/timoni-module \
  --version latest \
  --namespace yuptime \
  -f values.cue \
  --dry-run
```
