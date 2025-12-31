<p align="center">
  <img src="docs/assets/logo.svg" alt="Yuptime" width="120" height="120" />
</p>

<h1 align="center">Yuptime</h1>

<p align="center">
  <strong>Kubernetes-native monitoring where all configuration is CRDs</strong>
</p>

<p align="center">
  <a href="https://github.com/briansunter/yuptime/actions/workflows/ci.yml"><img src="https://github.com/briansunter/yuptime/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/briansunter/yuptime/actions/workflows/e2e.yml"><img src="https://github.com/briansunter/yuptime/actions/workflows/e2e.yml/badge.svg" alt="E2E Tests"></a>
  <img src="https://img.shields.io/badge/coverage-91.6%25-brightgreen" alt="Test Coverage">
  <a href="https://github.com/briansunter/yuptime/releases"><img src="https://img.shields.io/github/v/release/briansunter/yuptime" alt="Release"></a>
  <a href="https://github.com/briansunter/yuptime/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License"></a>
</p>

<p align="center">
  <a href="https://briansunter.github.io/yuptime">Documentation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#monitor-types">Monitor Types</a> •
  <a href="#examples">Examples</a>
</p>

---

## Why Yuptime?

**Yuptime** is a monitoring solution designed for Kubernetes-first teams. Unlike traditional monitoring tools that require databases and complex setups, Yuptime stores everything in Kubernetes Custom Resource Definitions (CRDs).

- **🎯 GitOps-Native**: All configuration lives in Git as YAML manifests
- **📦 Database-Free**: No databases to manage — state lives in CRD status subresources
- **🔒 Isolated Execution**: Each health check runs in its own Kubernetes Job pod
- **📊 Prometheus Metrics**: Native metrics export for Grafana dashboards
- **🔔 Alertmanager Integration**: Direct webhook integration for alert routing
- **⏰ Smart Suppression**: Maintenance windows with RRULE scheduling and ad-hoc silences

## Architecture

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

**Key Design Principles:**
- Controller only updates status subresources, never spec (source of truth stays in Git)
- Stateless checkers with no database access — results written directly to K8s API
- Each check runs in isolated Job pods for security and resource management

## Quick Start

### Prerequisites

- Kubernetes cluster (1.26+)
- kubectl configured

### Installation

Choose your preferred installation method:

<details>
<summary><b>📦 Timoni (Recommended)</b></summary>

[Timoni](https://timoni.sh) is a CUE-based package manager — most flexible and GitOps-friendly.

```bash
# Install Timoni
brew install stefanprodan/tap/timoni

# Apply the module
timoni apply yuptime oci://ghcr.io/briansunter/yuptime/timoni-module \
  --version latest \
  --namespace yuptime

# With custom values
cat > values.cue << 'EOF'
values: {
  image: {
    repository: "ghcr.io/briansunter/yuptime-api"
    tag:        "latest"
  }
  checkerImage: {
    repository: "ghcr.io/briansunter/yuptime-checker"
    tag:        "latest"
  }
  mode: "production"
  logging: level: "info"
  crds: install: true
}
EOF

timoni apply yuptime oci://ghcr.io/briansunter/yuptime/timoni-module \
  --version latest \
  --namespace yuptime \
  -f values.cue
```

</details>

<details>
<summary><b>⎈ Helm</b></summary>

Standard Helm 3 installation with OCI registry support.

```bash
# Install from GHCR (public, no login required)
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace

# With custom values
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace \
  --set mode=production \
  --set logging.level=info
```

</details>

<details>
<summary><b>📋 kubectl (Static Manifests)</b></summary>

Direct Kubernetes resource application — no tools required.

```bash
# Apply CRDs first
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/crds.yaml

# Create namespace and apply all resources
kubectl create namespace yuptime
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/all.yaml -n yuptime
```

</details>

### Verify Installation

```bash
# Check pods are running
kubectl get pods -n yuptime

# Check CRDs are installed
kubectl get crds | grep yuptime

# Port forward to access metrics
kubectl port-forward -n yuptime svc/yuptime-api 3000:3000
curl http://localhost:3000/health
```

## Your First Monitor

Create a simple HTTP monitor:

```yaml
# my-monitor.yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: example-website
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://example.com"
      method: GET
  successCriteria:
    http:
      acceptedStatusCodes: [200, 201]
```

```bash
kubectl apply -f my-monitor.yaml
```

Check the monitor status:

```bash
kubectl get monitors -n yuptime
kubectl describe monitor example-website -n yuptime
```

## Monitor Types

Yuptime supports **14 monitor types** for comprehensive infrastructure monitoring:

| Type | Description | Use Case |
|------|-------------|----------|
| **http** | HTTP/HTTPS endpoints | APIs, websites, webhooks |
| **tcp** | TCP port connectivity | Databases, services |
| **dns** | DNS record queries | DNS infrastructure |
| **ping** | ICMP ping checks | Network connectivity |
| **websocket** | WebSocket connections | Real-time services |
| **grpc** | gRPC health checks | Microservices |
| **mysql** | MySQL connectivity | Database health |
| **postgresql** | PostgreSQL connectivity | Database health |
| **redis** | Redis PING | Cache health |
| **kubernetes** | K8s resource health | Deployments, pods |
| **push** | Push-based monitoring | Custom apps |
| **steam** | Steam game servers | Gaming infrastructure |
| **keyword** | Content matching | Page content validation |
| **jsonQuery** | JSON response validation | API response checking |

## Examples

<details>
<summary><b>HTTP Monitor with Authentication</b></summary>

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: api-with-auth
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://api.example.com/health"
      method: GET
      headers:
        Authorization: "Bearer ${API_TOKEN}"
      authType: bearer
      bearerToken:
        secretRef:
          name: api-credentials
          key: token
  successCriteria:
    http:
      acceptedStatusCodes: [200]
```

</details>

<details>
<summary><b>JSON Response Validation</b></summary>

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: api-json-check
  namespace: yuptime
spec:
  type: jsonQuery
  schedule:
    intervalSeconds: 120
    timeoutSeconds: 30
  target:
    http:
      url: "https://api.example.com/status"
      method: GET
  successCriteria:
    jsonQuery:
      queries:
        - path: "$.status"
          operator: equals
          value: "healthy"
        - path: "$.services[*].status"
          operator: all_equal
          value: "up"
```

</details>

<details>
<summary><b>TCP Database Check</b></summary>

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: postgres-connectivity
  namespace: yuptime
spec:
  type: tcp
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    tcp:
      host: "postgres.database.svc.cluster.local"
      port: 5432
```

</details>

<details>
<summary><b>MySQL Health Check</b></summary>

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: mysql-health
  namespace: yuptime
spec:
  type: mysql
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    mysql:
      host: "mysql.database.svc.cluster.local"
      port: 3306
      database: "myapp"
      user: "monitor"
      passwordSecretRef:
        name: mysql-credentials
        key: password
      query: "SELECT 1"
```

</details>

<details>
<summary><b>gRPC Health Check</b></summary>

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
      host: "my-service.default.svc.cluster.local"
      port: 50051
      service: "my.package.MyService"
      useTLS: false
```

</details>

<details>
<summary><b>Kubernetes Deployment Health</b></summary>

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: my-app-deployment
  namespace: yuptime
spec:
  type: kubernetes
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    kubernetes:
      kind: Deployment
      name: my-app
      namespace: production
      expectedReplicas: 3
```

</details>

<details>
<summary><b>Bulk Monitors with MonitorSet</b></summary>

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MonitorSet
metadata:
  name: api-endpoints
  namespace: yuptime
spec:
  defaults:
    schedule:
      intervalSeconds: 60
      timeoutSeconds: 30
    successCriteria:
      http:
        acceptedStatusCodes: [200]
  monitors:
    - name: users-api
      type: http
      target:
        http:
          url: "https://api.example.com/users"
      labels:
        team: backend

    - name: orders-api
      type: http
      target:
        http:
          url: "https://api.example.com/orders"
      labels:
        team: backend
```

</details>

<details>
<summary><b>Maintenance Window (RRULE)</b></summary>

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MaintenanceWindow
metadata:
  name: weekly-maintenance
  namespace: yuptime
spec:
  schedule: "RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=2"
  duration: "2h"
  selector:
    matchLabels:
      environment: production
```

</details>

<details>
<summary><b>Ad-hoc Silence</b></summary>

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Silence
metadata:
  name: emergency-silence
  namespace: yuptime
spec:
  startsAt: "2025-12-30T10:00:00Z"
  endsAt: "2025-12-30T12:00:00Z"
  matchers:
    - name: severity
      value: critical
      isRegex: false
  comment: "Emergency maintenance window"
  createdBy: "ops-team"
```

</details>

## CRD Reference

Yuptime defines 5 Custom Resource Definitions:

| CRD | Description | Scope |
|-----|-------------|-------|
| **Monitor** | Single health check definition | Namespaced |
| **MonitorSet** | Bulk monitor definitions | Namespaced |
| **MaintenanceWindow** | Scheduled suppression (RRULE) | Namespaced |
| **Silence** | Ad-hoc alert muting | Namespaced |
| **YuptimeSettings** | Global configuration | Cluster |

For complete API reference, see the [documentation](https://briansunter.github.io/yuptime).

## Alerting

Yuptime integrates directly with Prometheus Alertmanager:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: critical-api
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    http:
      url: "https://api.example.com/health"
  alerting:
    alertmanagerUrl: "http://alertmanager.monitoring:9093"
    labels:
      severity: critical
      team: platform
```

## Metrics

Yuptime exposes Prometheus metrics on port 3000:

```bash
# Port forward and scrape metrics
kubectl port-forward -n yuptime svc/yuptime-api 3000:3000
curl http://localhost:3000/metrics
```

Key metrics:
- `yuptime_monitor_status` - Current monitor status (1=up, 0=down)
- `yuptime_monitor_latency_seconds` - Check latency histogram
- `yuptime_monitor_checks_total` - Total checks performed
- `yuptime_monitor_failures_total` - Total check failures

## Development

```bash
# Clone and install
git clone https://github.com/briansunter/yuptime.git
cd yuptime
bun install

# Run development server
bun run dev

# Run tests
bun run test

# Type checking and linting
bun run type-check
bun run lint
```

See the [Development Guide](https://briansunter.github.io/yuptime/development/) for more details.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a Pull Request.

## License

[Apache License 2.0](LICENSE)

## Support

- 📖 [Documentation](https://briansunter.github.io/yuptime)
- 🐛 [Issue Tracker](https://github.com/briansunter/yuptime/issues)
- 💬 [Discussions](https://github.com/briansunter/yuptime/discussions)
