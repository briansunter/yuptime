# Yuptime

**Kubernetes-native monitoring where all configuration is CRDs.**

A single-instance monitoring solution that runs entirely within Kubernetes. All configuration is managed through Custom Resource Definitions (CRDs) — perfect for GitOps workflows with Flux or Argo CD.

## Key Features

- **CRD-Driven**: Monitors, alerts, status pages, and users are Kubernetes resources
- **GitOps-Native**: Configuration lives in Git; the app reconciles and executes
- **10 Monitor Types**: HTTP, TCP, DNS, Ping, WebSocket, JSON queries, Kubernetes endpoints, Steam, and more
- **8 Alert Providers**: Slack, Discord, Telegram, SMTP, webhooks, PagerDuty, Pushover, Mattermost
- **Status Pages**: Public-facing pages with custom domains and SVG badges
- **Smart Suppression**: Maintenance windows with RRULE scheduling and ad-hoc silences
- **Isolated Execution**: Each monitor check runs in isolated Kubernetes Jobs
- **Authentication**: OIDC, local users, and API key support

## Architecture

Yuptime runs as a single pod with integrated API server, UI, controller, scheduler, and notification worker. Each monitor check runs in an isolated Kubernetes Job pod.

```
Yuptime Pod
├── Fastify API + React UI (port 3000)
├── Kubernetes Controller (watches CRDs)
├── Monitor Scheduler (priority queue + lease locking)
└── Notification Worker (state transitions)

Checker Jobs (isolated pods)
├── Job 1: Run check → Update Monitor CRD status (no DB)
└── Job 2: Run check → Update Monitor CRD status (no DB)
```

**Design Principles:**
- Controller only updates status, never spec (source of truth)
- Stateless checkers with no database access
- Status updates use merge-patch format
- GitOps-native with declarative configuration

## Quick Start

**Prerequisites:** Kubernetes cluster (1.26+)

Choose your installation method:

### Option 1: Timoni (Recommended)

Timoni is a CUE-based package manager — most flexible and GitOps-friendly.

```bash
# Install Timoni
brew install timoni  # macOS
# or: curl -Lo timoni https://github.com/stefanprodan/timoni/...

# Pull the module
timoni mod pull oci://ghcr.io/yuptime/timoni/yuptime -o ./timoni/yuptime

# Create values file
cat > values.yaml <<EOF
namespace: yuptime
image:
  repository: ghcr.io/yuptime/yuptime
  tag: v0.0.8
database:
  type: sqlite  # or postgresql
auth:
  mode: local  # or 'oidc'
EOF

# Install
timoni bundle apply yuptime -n yuptime -f values.yaml
```

### Option 2: Helm

Standard Helm 3 installation with OCI registry support.

```bash
# Login to GitHub Container Registry
helm registry login ghcr.io

# Install from OCI
helm install yuptime oci://ghcr.io/yuptime/charts/yuptime --version v0.0.8

# With custom values
helm install yuptime oci://ghcr.io/yuptime/charts/yuptime \
  --set database.type=postgresql \
  --set auth.mode=oidc \
  --set auth.oidc.issuerUrl=https://your-oidc.com
```

### Option 3: kubectl (Static Manifests)

Direct Kubernetes resource application — no tools required.

```bash
# Apply CRDs first
kubectl apply -f manifests/crds.yaml

# Create namespace
kubectl create namespace yuptime

# Apply all resources
kubectl apply -f manifests/all.yaml
```

**Verify Installation:**

```bash
kubectl get pods -n yuptime
kubectl port-forward -n yuptime svc/yuptime 3000:3000
open http://localhost:3000
```

## Usage

### Create a Monitor

```yaml
# monitor.yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: example-website
  namespace: yuptime
spec:
  type: http
  http:
    url: "https://example.com"
    method: GET
    expectedStatus: 200
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  alert:
    threshold: 3
    reopenAfter: "5m"
```

```bash
kubectl apply -f monitor.yaml
```

### Set Up Alerts

**1. Notification Provider:**

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: NotificationProvider
metadata:
  name: slack
  namespace: yuptime
spec:
  type: slack
  slack:
    webhookUrl: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

**2. Notification Policy:**

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: NotificationPolicy
metadata:
  name: critical-alerts
  namespace: yuptime
spec:
  selector:
    matchLabels:
      severity: critical
  providers:
    - name: slack
      namespace: yuptime
```

### Bulk Monitors (MonitorSet)

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MonitorSet
metadata:
  name: api-endpoints
  namespace: yuptime
spec:
  monitors:
    - name: users-api
      type: http
      http:
        url: "https://api.example.com/users"
      labels:
        team: backend
        severity: critical

    - name: orders-api
      type: http
      http:
        url: "https://api.example.com/orders"
      labels:
        team: backend
        severity: high
```

### Status Pages & Suppression

**StatusPage:**

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: StatusPage
metadata:
  name: public-status
  namespace: yuptime
spec:
  title: "My Service Status"
  customDomain: "status.example.com"
  groups:
    - name: "Core Services"
      monitors:
        - name: website
          namespace: yuptime
```

**MaintenanceWindow (RRULE):**

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MaintenanceWindow
metadata:
  name: weekly-maintenance
  namespace: yuptime
spec:
  schedule: "RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=2"
  selector:
    matchLabels:
      environment: production
  duration: "2h"
```

**Silence (ad-hoc):**

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Silence
metadata:
  name: emergency-silence
  namespace: yuptime
spec:
  start: "2025-12-28T10:00:00Z"
  end: "2025-12-28T12:00:00Z"
  selector:
    matchLabels:
      severity: critical
```

## CRD Reference

Yuptime defines 10 CRDs:

- **YuptimeSettings**: Global configuration (auth, scheduler, retention)
- **Monitor**: Single health check (type, schedule, alerting)
- **MonitorSet**: Bulk monitor definitions (inline, no child CRDs)
- **NotificationProvider**: Alert credentials (8 provider types)
- **NotificationPolicy**: Event routing (label selectors)
- **StatusPage**: Public status page (groups, custom domain)
- **MaintenanceWindow**: Recurring suppression (RRULE)
- **Silence**: Ad-hoc alert muting (time-bounded)
- **LocalUser**: Local accounts (argon2 hashing)
- **ApiKey**: API tokens with scopes

## Monitor Types

**HTTP:** Endpoints with validation (headers, body, TLS)

```yaml
type: http
http:
  url: "https://api.example.com/health"
  method: GET
  headers:
    Authorization: "Bearer TOKEN"
  expectedStatus: 200
  bodyContains: "healthy"
```

**TCP:** Port connectivity

```yaml
type: tcp
tcp:
  host: "db.example.com"
  port: 5432
```

**DNS:** DNS queries

```yaml
type: dns
dns:
  server: "8.8.8.8"
  query: "example.com"
  queryType: A
```

**Ping:** ICMP checks (Linux only)

```yaml
type: ping
ping:
  host: "example.com"
  count: 3
```

**WebSocket:** Connection testing

```yaml
type: websocket
websocket:
  url: "wss://example.com/ws"
```

**Kubernetes:** Resource health

```yaml
type: kubernetes
kubernetes:
  resource: deployment
  name: my-app
  namespace: production
```

**JSON Query:** Extract and validate JSON responses

```yaml
type: http
http:
  url: "https://api.example.com/health"
jsonQuery:
  - path: "status"
    equals: "ok"
```

## Development

**Prerequisites:** Bun 1.1+, Node.js 20+, Kubernetes cluster

**Setup:**

```bash
git clone https://github.com/yuptime/yuptime.git
cd yuptime
bun install

# Terminal 1: Backend
bun run dev

# Terminal 2: Frontend
cd web && bun install && bun run dev
```

**Commands:**

```bash
bun run dev              # Development server
bun run build            # Build TypeScript + frontend
bun run type-check       # TypeScript check
bun run lint             # Biome linter
bun run lint:fix         # Auto-fix issues
bun run db:push          # Push schema changes
bun run test             # Run tests
bun run test:ci          # CI mode
```

**Pre-commit hooks:** Lint, type-check, and tests run automatically.

**Test checker executor locally:**

```bash
bun src/checker-executor/cli.ts <namespace> <monitor-name>
```

## Deployment

**Production:**
- Use PostgreSQL (not SQLite)
- PersistentVolumeClaim for storage
- Set CPU/memory requests and limits
- Enable Prometheus metrics

**Environment Variables:**

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection | SQLite file |
| `KUBERNETES_NAMESPACE` | Namespace (auto-detected) | - |
| `NODE_ENV` | Environment | `production` |
| `PORT` | API server port | `3000` |

**Build images:**

```bash
docker build -t yuptime:yuptime .
docker build -f Dockerfile.checker -t yuptime:checker .
```

## Troubleshooting

**Checker jobs not running:**

```bash
kubectl describe role yuptime-checker -n yuptime
kubectl logs -n yuptime <scheduler-pod>
```

**Alerts not sending:**

```bash
kubectl get notificationproviders -n yuptime
kubectl logs -n yuptime <yuptime-pod>
```

**Database issues:**

```bash
kubectl get secret yuptime-db -n yuptime
kubectl exec -n yuptime <pod> -- env | grep DATABASE
```

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## Tech Stack

- **Runtime**: Bun 1.1+
- **Backend**: Fastify
- **Frontend**: React + TanStack Router + shadcn/ui + Tailwind
- **Database**: Drizzle ORM (SQLite/PostgreSQL)
- **Kubernetes**: @kubernetes/client-node with informers
- **Deployment**: Timoni + CUE

## Implementation Status

**Complete:** CRDs, controller, scheduler, 8 checker types, 8 notification providers, status pages, suppressions, database-free checker executor, pre-commit hooks

**In Progress:** Authentication (OIDC + local + API keys), Prometheus metrics, frontend dashboard, Timoni module packaging

## License

Apache License 2.0

## Support

- [docs/](docs/)
- [GitHub Issues](https://github.com/yuptime/yuptime/issues)
- [GitHub Discussions](https://github.com/yuptime/yuptime/discussions)
