# Architecture

Yuptime is designed around Kubernetes-native principles: declarative configuration, eventual consistency, and separation of concerns.

## System Overview

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

## Components

### Yuptime API Pod

The main Yuptime pod runs three components:

#### 1. Controller

The controller watches all Yuptime CRDs using Kubernetes informers:

```
Controller
├── Monitor Informer       → Watches Monitor resources
├── MonitorSet Informer    → Watches MonitorSet resources
├── Maintenance Informer   → Watches MaintenanceWindow resources
├── Silence Informer       → Watches Silence resources
└── Settings Informer      → Watches YuptimeSettings resources
```

Key behaviors:
- **Reconciliation**: Ensures actual state matches desired state
- **Status updates only**: Never modifies `.spec`, only `.status`
- **Event-driven**: Reacts to CRD changes via informers

#### 2. Job Manager

The job manager schedules and creates Kubernetes Jobs:

```
Job Manager
├── Scheduler              → Determines when checks should run
├── Jitter Calculator      → Adds deterministic jitter to prevent thundering herd
└── Job Creator            → Creates K8s Jobs for each check
```

Features:
- **Deterministic jitter**: Spreads checks evenly based on monitor name hash
- **Kubernetes Lease**: Ensures only one scheduler runs
- **Job cleanup**: Removes completed/failed jobs after retention period

#### 3. Metrics Server

Exposes Prometheus metrics on port 3000:

```
Metrics Server (Port 3000)
├── /health    → Liveness probe
├── /ready     → Readiness probe
└── /metrics   → Prometheus scrape endpoint
```

### Checker Job Pods

Each health check runs in an isolated Kubernetes Job:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: monitor-check-example-website-1703930400
  namespace: yuptime
  labels:
    yuptime.io/monitor: example-website
spec:
  template:
    spec:
      containers:
        - name: checker
          image: ghcr.io/briansunter/yuptime-checker:latest
          env:
            - name: MONITOR_NAMESPACE
              value: yuptime
            - name: MONITOR_NAME
              value: example-website
      serviceAccountName: yuptime-checker
      restartPolicy: Never
```

Benefits:
- **Isolation**: Each check has its own pod, process, and resources
- **Security**: Minimal RBAC permissions per checker
- **Observability**: Each check has its own logs
- **Reliability**: A failing check doesn't affect others

### Status Update Flow

Checkers update Monitor status directly via the Kubernetes API:

```
1. Job Manager creates Job
          ↓
2. Checker pod runs check
          ↓
3. Checker updates Monitor status via K8s API
          ↓
4. Controller sees status change
          ↓
5. Metrics are updated
```

The status update uses merge-patch:

```bash
# What the checker does internally
kubectl patch monitor example-website \
  --type=merge \
  --subresource=status \
  --patch='{"status":{"lastCheck":{"success":true,"latencyMs":125}}}'
```

## Data Flow

### Check Execution

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Job Manager │────→│ K8s Job API  │────→│ Checker Pod  │
└──────────────┘     └──────────────┘     └──────────────┘
                                                  │
                                                  │ Executes check
                                                  ▼
                                          ┌──────────────┐
                                          │   Target     │
                                          │  (HTTP/TCP/  │
                                          │   DNS/...)   │
                                          └──────────────┘
                                                  │
                                                  │ Returns result
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Controller  │←────│  K8s API     │←────│ Checker Pod  │
└──────────────┘     │ (status patch)│     └──────────────┘
                     └──────────────┘
```

### Alerting Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Controller  │────→│ State Change │────→│ Alertmanager │
│  (watches    │     │  Detection   │     │  Webhook     │
│   status)    │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │ Alertmanager │
                                          │  (routes to  │
                                          │ Slack/PD/...) │
                                          └──────────────┘
```

## Design Principles

### 1. Spec is Read-Only

The controller never modifies the `.spec` of any CRD:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: example
spec:          # ← Read by controller, never modified
  type: http
  ...
status:        # ← Written by controller and checkers
  lastCheck:
    success: true
```

This ensures:
- Git remains the source of truth
- GitOps tools (Flux/Argo) don't conflict with the controller
- Changes are auditable in Git history

### 2. No Database

Yuptime stores all state in Kubernetes:

| Data | Storage |
|------|---------|
| Monitor configuration | `.spec` of Monitor CRD |
| Check results | `.status` of Monitor CRD |
| Uptime history | `.status.uptime` of Monitor CRD |
| Current state | `.status.state` of Monitor CRD |

Benefits:
- No database to backup, scale, or manage
- State is replicated by etcd (Kubernetes backing store)
- Disaster recovery = `kubectl apply -f manifests/`

### 3. Isolated Execution

Each check runs in its own pod:

```
┌────────────────────────────────────────────────────┐
│                  Traditional                        │
│  ┌────────────────────────────────────────────┐    │
│  │           Monolithic Process               │    │
│  │  Check 1 │ Check 2 │ Check 3 │ Check N    │    │
│  │  (shares memory, CPU, network stack)       │    │
│  └────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│                    Yuptime                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ Pod 1   │ │ Pod 2   │ │ Pod 3   │ │ Pod N   │  │
│  │ Check 1 │ │ Check 2 │ │ Check 3 │ │ Check N │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│  (isolated memory, CPU, network stack)            │
└────────────────────────────────────────────────────┘
```

### 4. Deterministic Jitter

Checks are spread out to prevent thundering herd:

```
Without jitter:           With jitter:
│ All checks at :00      │ Check 1 at :00
│                        │ Check 2 at :12
│                        │ Check 3 at :27
│                        │ Check 4 at :41
│                        │ Check 5 at :55
```

The jitter is deterministic (hash-based), so checks run at the same offset across restarts.

## RBAC

Yuptime uses two service accounts:

### yuptime-api

Full access for the controller:

```yaml
rules:
  - apiGroups: ["monitoring.yuptime.io"]
    resources: ["*"]
    verbs: ["get", "list", "watch", "update", "patch"]
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["create", "delete", "get", "list", "watch"]
```

### yuptime-checker

Minimal access for checker pods:

```yaml
rules:
  - apiGroups: ["monitoring.yuptime.io"]
    resources: ["monitors"]
    verbs: ["get"]
  - apiGroups: ["monitoring.yuptime.io"]
    resources: ["monitors/status"]
    verbs: ["patch", "update"]
```

## Next Steps

- [Installation options](/guide/installation/timoni)
- [Monitor configuration](/guide/monitors)
- [Alerting setup](/guide/alerting)
