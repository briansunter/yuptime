# Yuptime

[![Test Coverage](https://img.shields.io/badge/coverage-91.6%25-brightgreen)](https://github.com/briansunter/yuptime/actions/workflows/ci.yml)

**Kubernetes-native monitoring where all configuration is CRDs.**

A single-instance monitoring solution that runs entirely within Kubernetes. All configuration is managed through Custom Resource Definitions (CRDs) — perfect for GitOps workflows with Flux or Argo CD.

## Key Features

- **CRD-Driven**: All monitoring configuration is Kubernetes resources
- **GitOps-Native**: Configuration lives in Git; the app reconciles and executes
- **10 Monitor Types**: HTTP, TCP, DNS, Ping, WebSocket, JSON queries, Kubernetes endpoints, Steam, and more
- **Alertmanager Integration**: Direct webhook integration for alert routing
- **Smart Suppression**: Maintenance windows with RRULE scheduling and ad-hoc silences
- **Isolated Execution**: Each monitor check runs in isolated Kubernetes Jobs
- **Database-Free**: Stateless design using CRD status subresources
- **Prometheus Metrics**: Native metrics export for Grafana dashboards

## Architecture

Yuptime runs as a single pod with controller, job manager, and metrics server. Each monitor check runs in an isolated Kubernetes Job pod.

```
Yuptime Pod
├── Metrics Server (Prometheus scraping on port 3000)
├── Kubernetes Controller (watches CRDs)
├── Job Manager (Kubernetes Job execution)
└── Notification Worker (sends alerts to Alertmanager)

Checker Jobs (isolated pods)
├── Job 1: Run check → Update Monitor CRD status (no DB)
└── Job 2: Run check → Update Monitor CRD status (no DB)

External:
├── Prometheus (metrics storage)
├── Alertmanager (notification routing)
└── Grafana (dashboards and visualization)
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

# Pull the module from GHCR
timoni mod pull oci://ghcr.io/briansunter/yuptime/timoni-module --version 0.0.18 -o ./timoni/yuptime

# Create a values file
cat > values.cue <<EOF
values: {
  image: {
    repository: "ghcr.io/briansunter/yuptime-api"
    tag: "0.0.18"  # Use 'latest' for auto-updates
    pullPolicy: "Always"
  }
  checkerImage: {
    repository: "ghcr.io/briansunter/yuptime-checker"
    tag: "0.0.18"
    pullPolicy: "Always"
  }
  mode: "production"
  database: {
    type: "sqlite"
    sqlite: path: "/data/yuptime.db"
  }
  storage: {
    enabled: true
    size: "10Gi"
    storageClass: "standard"  # Adjust for your cluster
  }
  auth: {
    mode: "local"  # or 'oidc'
    session: secret: "CHANGE-THIS-SECRET"
    adminUser: {
      enabled: true
      username: "admin"
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$Ha7NhMrOOSle+AMHOp5XNw$jhFoCy75xBnmZJY+FKPujTeFg26xnR1wfDwFJJVrBhU"
    }
  }
}
EOF

# Install
timoni apply yuptime ./timoni/yuptime -n yuptime -f values.cue
```

### Option 2: Helm

Standard Helm 3 installation with OCI registry support.

```bash
# Install from GHCR (public, no login required)
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime --version 0.0.18

# With custom values file
cat > values.yaml <<EOF
image:
  repository: ghcr.io/briansunter/yuptime-api
  tag: 0.0.18
  pullPolicy: Always

checkerImage:
  repository: ghcr.io/briansunter/yuptime-checker
  tag: 0.0.18
  pullPolicy: Always

mode: production
logging:
  level: info

database:
  type: sqlite
  sqlite:
    path: /data/yuptime.db

storage:
  enabled: true
  size: 10Gi
  storageClass: standard

auth:
  mode: local
  session:
    secret: CHANGE-THIS-SECRET
  adminUser:
    enabled: true
    username: admin
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$Ha7NhMrOOSle+AMHOp5XNw$jhFoCy75xBnmZJY+FKPujTeFg26xnR1wfDwFJJVrBhU"
EOF

helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --version 0.0.18 \
  -f values.yaml

# Or with --set flags
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --version 0.0.18 \
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

## Configuration

### Timoni Values Reference

When using Timoni, customize your deployment with a CUE values file:

```cue
values: {
  // Container images
  image: {
    repository: "ghcr.io/briansunter/yuptime-api"
    tag: "0.0.18"          // or 'latest' for auto-updates
    digest: ""             // optional: pin by digest
    pullPolicy: "Always"   // 'Always', 'IfNotPresent', or 'Never'
  }
  checkerImage: {
    repository: "ghcr.io/briansunter/yuptime-checker"
    tag: "0.0.18"
    digest: ""
    pullPolicy: "Always"
  }

  // Deployment mode
  mode: "production"       // 'development' or 'production'

  // Logging configuration
  logging: level: "info"   // 'debug', 'info', 'warn', 'error'

  // Database configuration
  database: {
    type: "sqlite"         // 'sqlite' or 'postgresql'
    sqlite: path: "/data/yuptime.db"
    postgresql: {
      host: "postgresql.yptime.svc.cluster.local"
      port: 5432
      database: "yuptime"
      user: "yuptime"
      // password: from secretRef
    }
  }

  // Persistent storage
  storage: {
    enabled: true
    size: "10Gi"
    storageClass: "standard"    // adjust for your cluster
    accessMode: "ReadWriteOnce"
  }

  // Authentication
  auth: {
    mode: "local"         // 'local', 'oidc', or 'disabled'
    session: secret: "your-session-secret-here"
    adminUser: {
      enabled: true
      username: "admin"
      // Generate password hash with: bun run hash-password <password>
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$..."
    }
    oidc: {
      issuerUrl: "https://your-oidc-provider.com"
      clientId: "yuptime"
      // clientSecret: from secretRef
      redirectUrl: "http://localhost:3000/auth/callback"
    }
  }

  // Health probes
  probes: {
    liveness: {
      enabled: true
      initialDelaySeconds: 30
      periodSeconds: 30
      timeoutSeconds: 10
      failureThreshold: 3
    }
    readiness: {
      enabled: true
      initialDelaySeconds: 10
      periodSeconds: 10
      timeoutSeconds: 5
      failureThreshold: 3
    }
  }

  // CRD installation
  crds: install: true     // set to false if CRDs are pre-installed

  // Test resources
  test: enabled: false    // disable test resources in production
}
```

### Helm Values Reference

When using Helm, customize with a YAML values file or `--set` flags:

```yaml
# Container images
image:
  repository: ghcr.io/briansunter/yuptime-api
  tag: 0.0.18
  digest: ""
  pullPolicy: Always

checkerImage:
  repository: ghcr.io/briansunter/yuptime-checker
  tag: 0.0.18
  digest: ""
  pullPolicy: Always

# Deployment mode
mode: production

# Logging
logging:
  level: info

# Database configuration
database:
  type: sqlite                    # sqlite or postgresql
  sqlite:
    path: /data/yuptime.db
  postgresql:
    host: postgresql.yuptime.svc.cluster.local
    port: 5432
    database: yuptime
    user: yuptime
    existingSecret: yptime-db     # optional: use existing secret

# Persistent storage
storage:
  enabled: true
  size: 10Gi
  storageClass: standard          # adjust for your cluster
  accessMode: ReadWriteOnce

# Authentication
auth:
  mode: local                     # local, oidc, or disabled
  session:
    secret: change-this-secret
    existingSecret: ""            # optional: use existing secret
  adminUser:
    enabled: true
    username: admin
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$..."
  oidc:
    issuerUrl: https://your-oidc.com
    clientId: yuptime
    clientSecret: ""
    existingSecret: ""            # optional: use existing secret
    redirectUrl: http://localhost:3000/auth/callback

# Resource limits
resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi

# Node selector
nodeSelector: {}

# Tolerations
tolerations: []

# Affinity
affinity: {}

# Health probes
probes:
  liveness:
    enabled: true
    initialDelaySeconds: 30
    periodSeconds: 30
    timeoutSeconds: 10
    failureThreshold: 3
  readiness:
    enabled: true
    initialDelaySeconds: 10
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3

# Service configuration
service:
  type: ClusterIP               # ClusterIP, NodePort, or LoadBalancer
  port: 3000
  annotations: {}

# Ingress
ingress:
  enabled: false
  className: nginx
  annotations: {}
    # cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: yuptime.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: yuptime-tls
      hosts:
        - yuptime.example.com

# CRD installation
crds:
  install: true                  # set to false if CRDs are pre-installed
```

### Common Customization Examples

**PostgreSQL Database:**

```yaml
# Timoni (CUE)
database: {
  type: "postgresql"
  postgresql: {
    host: "postgres.yuptime.svc.cluster.local"
    port: 5432
    database: "yuptime"
    user: "yuptime"
    existingSecret: "yuptime-db-credentials"
  }
  storage: enabled: false  # Disable if using external PostgreSQL
}

# Helm (YAML)
database:
  type: postgresql
  postgresql:
    host: postgres.yuptime.svc.cluster.local
    port: 5432
    database: yuptime
    user: yuptime
    existingSecret: yuptime-db-credentials
storage:
  enabled: false
```

**OIDC Authentication:**

```yaml
# Timoni (CUE)
auth: {
  mode: "oidc"
  session: secret: "your-session-secret"
  oidc: {
    issuerUrl: "https://accounts.google.com"
    clientId: "your-client-id.apps.googleusercontent.com"
    existingSecret: "yuptime-oidc"
    redirectUrl: "https://yuptime.example.com/auth/callback"
  }
}

# Helm (YAML)
auth:
  mode: oidc
  session:
    secret: your-session-secret
  oidc:
    issuerUrl: https://accounts.google.com
    clientId: your-client-id.apps.googleusercontent.com
    existingSecret: yuptime-oidc
    redirectUrl: https://yuptime.example.com/auth/callback
```

**Ingress with TLS:**

```yaml
# Helm only (configure via values.yaml)
ingress:
  enabled: true
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

**Resource Limits:**

```yaml
# Timoni (CUE) - add to values
resources: {
  limits: {
    cpu: "2000m"
    memory: "2Gi"
  }
  requests: {
    cpu: "1000m"
    memory: "1Gi"
  }
}

# Helm (YAML)
resources:
  limits:
    cpu: 2000m
    memory: 2Gi
  requests:
    cpu: 1000m
    memory: 1Gi
```

### Generating Password Hashes

Yuptime uses Argon2id for password hashing. Generate a hash with:

```bash
bun run hash-password <your-password>
```

Example output:
```
$ bun run hash-password mysecretpassword
$argon2id$v=19$m=65536,t=3,p=4$Ha7NhMrOOSle+AMHOp5XNw$jhFoCy75xBnmZJY+FKPujTeFg26xnR1wfDwFJJVrBhU
```

Use this hash in your `passwordHash` field.

### Upgrading

**Timoni:**

```bash
# Pull new module version
timoni mod pull oci://ghcr.io/briansunter/yuptime/timoni-module --version 0.0.19 -o ./timoni/yuptime

# Upgrade deployment
timoni apply yuptime ./timoni/yuptime -n yuptime -f values.cue
```

**Helm:**

```bash
# Upgrade with new version
helm upgrade yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --version 0.0.19 \
  -f values.yaml

# Or reuse existing values
helm upgrade yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --version 0.0.19 \
  --reuse-values
```

### Uninstalling

**Timoni:**

```bash
timoni delete yuptime -n yuptime
```

**Helm:**

```bash
helm uninstall yuptime -n yuptime
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
- **Deployment**: Timoni (CUE) + Helm (OCI) to GHCR

## Implementation Status

**Complete:**
- ✅ CRDs, controller, scheduler, priority queue
- ✅ 8 checker types (HTTP, TCP, DNS, Ping, WebSocket, JSON query, Kubernetes, Steam)
- ✅ 8 notification providers (Slack, Discord, Telegram, SMTP, Webhook, PagerDuty, Pushover, Mattermost)
- ✅ Status pages with custom domains
- ✅ Suppressions (MaintenanceWindows with RRULE, Silences)
- ✅ Database-free checker executor (direct K8s API updates)
- ✅ Authentication (OIDC + local users + API keys)
- ✅ Pre-commit hooks (lint, type-check, tests)
- ✅ CI/CD with GHCR publishing (images + Helm chart + Timoni module)

**In Progress:**
- 🚧 Prometheus metrics and observability
- 🚧 Frontend dashboard polish

## License

Apache License 2.0

## Support

- [docs/](docs/)
- [GitHub Issues](https://github.com/yuptime/yuptime/issues)
- [GitHub Discussions](https://github.com/yuptime/yuptime/discussions)
