# GitOps Integration

Yuptime is designed for GitOps workflows. All configuration is in CRDs, making it perfect for Flux, Argo CD, or any GitOps tool.

## Design Principles

1. **Git is the source of truth** — Monitor specs live in Git
2. **Controller only writes status** — Never modifies spec
3. **Declarative configuration** — Apply desired state, controller reconciles

## Flux

### HelmRelease

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
```

### Kustomization

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: yuptime-monitors
  namespace: flux-system
spec:
  interval: 5m
  path: ./monitoring/yuptime
  sourceRef:
    kind: GitRepository
    name: fleet-infra
  prune: true
```

## Argo CD

### Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: yuptime
  namespace: argocd
spec:
  project: default
  source:
    chart: yuptime
    repoURL: ghcr.io/briansunter/yuptime/charts
    targetRevision: 0.0.18
    helm:
      values: |
        mode: production
  destination:
    server: https://kubernetes.default.svc
    namespace: yuptime
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

## Directory Structure

Organize monitors in Git:

```
monitoring/
├── yuptime/
│   ├── namespace.yaml
│   ├── settings.yaml
│   ├── monitors/
│   │   ├── api.yaml
│   │   ├── database.yaml
│   │   └── cache.yaml
│   ├── maintenance/
│   │   └── weekly.yaml
│   └── kustomization.yaml
```

## Best Practices

1. **Organize by service/team** — Group related monitors
2. **Use labels consistently** — For selection and routing
3. **Version control everything** — Monitors, settings, maintenance windows
4. **Review changes** — PRs for monitor changes like code
