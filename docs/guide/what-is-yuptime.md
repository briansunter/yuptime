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
  lastCheck:
    timestamp: "2025-12-30T10:00:00Z"
    success: true
    latencyMs: 125
  uptime:
    last24h: 99.95
    last7d: 99.98
```

Benefits:
- No database to manage, backup, or scale
- State is automatically replicated by the Kubernetes API
- Disaster recovery is just `kubectl apply`

### 3. Isolated Execution

Each health check runs in its own Kubernetes Job pod:

```
┌────────────────────┐
│    Yuptime API     │
│  (Controller Pod)  │
└─────────┬──────────┘
          │ Creates Jobs
          ▼
┌─────────────────────────────────────────┐
│          Checker Job Pods               │
├─────────┬─────────┬─────────┬──────────┤
│ Check 1 │ Check 2 │ Check 3 │ Check N  │
│  HTTP   │   TCP   │   DNS   │   ...    │
└─────────┴─────────┴─────────┴──────────┘
          │
          │ Updates status directly
          ▼
┌────────────────────┐
│   Monitor CRDs     │
│ (Status subresource)│
└────────────────────┘
```

Benefits:
- **Security**: Each check runs with minimal permissions
- **Isolation**: A failing check doesn't affect others
- **Resource control**: Set CPU/memory limits per check
- **Observability**: Each check has its own pod logs

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
┌─────────────────────────────────────────────────────────────────┐
│                         Yuptime Pod                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Metrics   │  │ Controller  │  │      Job Manager        │  │
│  │   Server    │  │  (Watches   │  │  (Creates K8s Jobs for  │  │
│  │ (Port 3000) │  │    CRDs)    │  │     each check)         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Checker Job Pods (Isolated)                   │
├─────────────────────────────────────────────────────────────────┤
│  Job 1: HTTP Check    →  Updates Monitor CRD status (no DB)     │
│  Job 2: TCP Check     →  Updates Monitor CRD status (no DB)     │
│  Job 3: DNS Check     →  Updates Monitor CRD status (no DB)     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        External Services                         │
├─────────────────────────────────────────────────────────────────┤
│  Prometheus (metrics)  │  Alertmanager (alerts)  │  Grafana     │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| **Controller** | Watches Monitor CRDs and reconciles desired state |
| **Job Manager** | Creates Kubernetes Jobs for each monitor check |
| **Metrics Server** | Exposes Prometheus metrics on port 3000 |
| **Checker Pods** | Isolated pods that execute health checks |

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
