# What is Yuptime?

Yuptime is a **Kubernetes-native monitoring solution** where all configuration is managed through Custom Resource Definitions (CRDs). It's designed for teams who want their monitoring to be part of their GitOps workflow.

## Key Principles

### 1. Everything is a CRD

Every aspect of Yuptime is configured through Kubernetes Custom Resources:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: my-api
  namespace: yuptime
spec:
  type: http
  target:
    http:
      url: "https://api.example.com/health"
```

This means your monitoring configuration:
- Lives in Git alongside your application code
- Is version-controlled and auditable
- Can be deployed with kubectl, Helm, Timoni, Flux, or Argo CD
- Benefits from Kubernetes RBAC

### 2. Database-Free Architecture

Unlike traditional monitoring tools, Yuptime **doesn't require a database**. All state is stored in the CRD status subresources:

```yaml
status:
  lastResult:
    executionId: "2cb34..."
    scheduledAt: "2025-12-30T10:00:00Z"
    startedAt: "2025-12-30T10:00:00.041Z"
    checkedAt: "2025-12-30T10:00:00.125Z"
    state: up
    latencyMs: 125
  uptime:
    last24h: 99.95
    last7d: 99.98
```

Benefits:
- No database to manage, backup, or scale
- State is automatically replicated by the Kubernetes API
- Disaster recovery is just `kubectl apply`

### 3. Bounded Persistent Execution

Checks run through a fixed pool of persistent worker processes in a checker
sidecar:

```
Yuptime Pod
├── Controller: exact slots, bounded queue, ordered status
└── Checker sidecar: fixed worker pool
    ├── worker 1: one attempt at a time
    ├── worker 2: one attempt at a time
    └── worker N: one attempt at a time
```

Benefits:
- **Low API load**: Normal checks create no Jobs or Pods
- **Bounded resources**: Concurrency and queue size are explicit limits
- **Failure isolation**: Hung workers are killed and replaced independently
- **Accurate timing**: Completion and retry duration never shift future slots

### 4. GitOps-Native

Yuptime follows the GitOps principle: **Git is the single source of truth**.

The controller:
- Only reads from the spec (never writes to it)
- Only writes to the status subresource
- Never stores state outside of Kubernetes

This means you can:
- Store all monitors in Git
- Use Flux or Argo CD to sync them
- Roll back by reverting a commit
- Audit who changed what and when

## Architecture Overview

```
Monitor CRDs -> Controller Check Engine -> Checker sidecar -> Targets
                       |
                       +-> Monitor status
                       +-> Prometheus
                       +-> Alertmanager
```

### Components

| Component | Description |
|-----------|-------------|
| **Controller** | Watches Monitor CRDs and reconciles desired state |
| **Check Engine** | Owns exact slots, admission, retries, and ordered publication |
| **Metrics Server** | Exposes Prometheus metrics on port 3000 |
| **Checker sidecar** | Supervises the fixed persistent worker pool |

## Custom Resources

Yuptime defines 5 CRDs:

| CRD | Description |
|-----|-------------|
| [Monitor](/reference/crds/monitor) | Single health check definition |
| [MonitorSet](/reference/crds/monitorset) | Bulk monitor definitions |
| [MaintenanceWindow](/reference/crds/maintenancewindow) | Scheduled suppression with RRULE |
| [Silence](/reference/crds/silence) | Ad-hoc alert muting |
| [YuptimeSettings](/reference/crds/settings) | Cluster-scoped global configuration |

## Monitor Types

Yuptime supports 14 monitor types:

| Type | Use Case |
|------|----------|
| **http** | APIs, websites, webhooks |
| **tcp** | Databases, services, ports |
| **dns** | DNS infrastructure |
| **ping** | Network connectivity |
| **websocket** | Real-time services |
| **grpc** | gRPC microservices |
| **mysql** | MySQL database health |
| **postgresql** | PostgreSQL database health |
| **redis** | Redis cache health |
| **kubernetes** | Deployments, pods, services |
| **push** | Custom applications |
| **steam** | Steam game servers |

## Comparison with Other Tools

### vs. Uptime Kuma

| Feature | Yuptime | Uptime Kuma |
|---------|---------|-------------|
| Configuration | CRDs (GitOps) | Web UI |
| Storage | Kubernetes API | SQLite |
| Deployment | Native K8s | Docker container |
| Check execution | Isolated Jobs | In-process |
| GitOps | Native | Requires workarounds |

### vs. Prometheus Blackbox Exporter

| Feature | Yuptime | Blackbox Exporter |
|---------|---------|-------------------|
| Configuration | CRDs | Prometheus config |
| State | In CRD status | No state |
| Alerting | Alertmanager integration | Prometheus rules |
| UI | Metrics/Grafana | Grafana |
| Suppressions | MaintenanceWindow, Silence | Alertmanager only |

## Next Steps

- [Getting Started](/guide/getting-started) — Install Yuptime in 5 minutes
- [Architecture](/guide/architecture) — Deep dive into how it works
- [Examples](/examples/) — Real-world configuration examples
