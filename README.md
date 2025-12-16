# KubeKuma

**Kubernetes-native monitoring where all configuration is CRDs.**

A single-instance monitoring solution that runs entirely within Kubernetes, with all configuration managed through Custom Resource Definitions (CRDs) and GitOps workflows.

## Key Features

- **CRD-Driven Configuration**: All monitors, alerts, status pages, and users are Kubernetes resources
- **GitOps-Ready**: Configuration lives in Git; the app reconciles and executes
- **Multiple Monitor Types**: HTTP, TCP, DNS, Ping, WebSocket, JSON queries, Kubernetes endpoints, and more
- **Intelligent Alerting**: Policy-based routing to Slack, Discord, Telegram, SMTP, webhooks, and more
- **Status Pages**: Public-facing status pages with custom domains and SVG badges
- **Single Instance**: One pod runs API, UI, scheduler, and controller with Kubernetes-enforced singleton semantics
- **No Hidden State**: Only runtime data (heartbeats, incidents) in database; spec is law

## Architecture

```
KubeKuma Pod
├── Fastify API Server (port 3000)
├── React SPA Frontend (embedded)
├── Kubernetes Controller (watches CRDs)
├── Monitor Scheduler (executes checks)
└── SQLite/PostgreSQL Database (for runtime data)
```

## Tech Stack

- **Runtime**: Bun
- **API**: Fastify
- **Frontend**: React + TanStack Router + shadcn/ui
- **ORM**: Drizzle (SQLite + PostgreSQL)
- **Kubernetes**: @kubernetes/client-node
- **Deployment**: Timoni + CUE

## CRD Types (10 Custom Resources)

### Global Configuration
- **KubeKumaSettings**: Cluster-scoped global configuration, auth, scheduler, retention, etc.

### Monitoring
- **Monitor**: Single health check with schedule, target, and success criteria
- **MonitorSet**: Bulk declarative monitor definitions (inline, no child CRDs)

### Alerting
- **NotificationProvider**: Webhook/API credentials (Slack, Discord, SMTP, etc.)
- **NotificationPolicy**: Routes monitor events to providers based on selectors

### Status Pages
- **StatusPage**: Public-facing status page with groups and badges

### Maintenance
- **MaintenanceWindow**: Planned maintenance suppression (with RRULE scheduling)
- **Silence**: Ad-hoc alert silencing (time-bounded, selector-based)

### Authentication
- **LocalUser**: Local user accounts (only if auth.mode=local)
- **ApiKey**: API access tokens with scopes

## Quick Start

### Prerequisites

- Kubernetes cluster (1.24+)
- Bun 1.1+
- Node.js 20+ (for web development)

### Development

```bash
# Install dependencies
bun install

# Setup environment
cp .env.example .env.local

# Run backend server
bun run dev

# In another terminal, build frontend
cd web
bun install
bun run dev
```

### Deployment

Use the Timoni module to deploy to Kubernetes:

```bash
timoni mod pull oci://ghcr.io/kubekuma/timoni/kubekuma -o ./timoni/kubekuma
timoni bundle apply kubekuma -n monitoring -f values.yaml
```

## Project Structure

```
.
├── src/                    # Backend source code
│   ├── index.ts           # Entry point
│   ├── server/            # Fastify API
│   ├── controller/        # Kubernetes controller
│   ├── scheduler/         # Check scheduler
│   ├── checkers/          # Monitor type implementations
│   ├── alerting/          # Notification system
│   ├── db/                # Drizzle schema and migrations
│   ├── types/             # TypeScript type definitions
│   └── lib/               # Shared utilities
├── web/                   # React frontend (TanStack Router)
├── k8s/                   # CRD definitions
├── timoni/                # Timoni deployment module
└── docs/                  # Documentation
```

## Implementation Status

### Phase 1: Foundation ✅
- [x] Project setup (Bun, TypeScript, Fastify)
- [x] Database schema (Drizzle with SQLite/PostgreSQL)
- [x] CRD type definitions (all 10 CRDs with Zod schemas)
- [x] HTTP checker implementation
- [x] Basic utilities (logger, config, secrets, selectors, uptime)

### Phase 2-11: In Progress
- [ ] Kubernetes controller and informers
- [ ] Scheduler with priority queue
- [ ] Additional checkers (TCP, DNS, Ping, WebSocket, etc.)
- [ ] Alerting system and providers
- [ ] Status pages
- [ ] Maintenance windows and silencing
- [ ] Full authentication (OIDC + local)
- [ ] Prometheus metrics endpoint
- [ ] Frontend with React/TanStack Router
- [ ] Timoni module packaging

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Apache License 2.0 - See LICENSE file for details.

## Support

- Documentation: [docs/](docs/)
- Issues: [GitHub Issues](https://github.com/kubekuma/kubekuma/issues)
- Discussions: [GitHub Discussions](https://github.com/kubekuma/kubekuma/discussions)
