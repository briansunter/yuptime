# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KubeKuma is a Kubernetes-native monitoring solution where all configuration is managed through Custom Resource Definitions (CRDs). It's designed as a single-instance application that runs entirely within Kubernetes with GitOps-ready workflows.

**Key Architecture Principle**: The controller only writes to status subresources, never to spec. The spec is the source of truth from CRDs.

## Tech Stack

- **Runtime**: Bun (>= 1.1.0)
- **Backend**: Fastify (port 3000)
- **Frontend**: React + TanStack Router + shadcn/ui + Tailwind CSS
- **Database**: Drizzle ORM with SQLite (dev) / PostgreSQL (prod)
- **Kubernetes**: @kubernetes/client-node with informers
- **Linting/Formatting**: Biome (not ESLint/Prettier)

## Development Commands

### Backend (Root)
```bash
bun install              # Install backend dependencies
bun run dev              # Start development server (hot reload)
bun run build            # Build TypeScript + build frontend
bun run start            # Run production build
bun run type-check       # TypeScript type check without emitting
bun run db:push          # Push database schema changes
bun run db:generate      # Generate Drizzle migration
```

### Frontend (web/)
```bash
cd web
bun install              # Install frontend dependencies
bun run dev              # Start Vite dev server (localhost:5173)
bun run build            # Build for production
bun run preview          # Preview production build locally
bun run type-check       # TypeScript type check
```

### Combined Development
```bash
# Terminal 1: Backend
bun run dev

# Terminal 2: Frontend
cd web && bun run dev
```

### Code Quality
```bash
npx @biomejs/biome check src/     # Lint backend
npx @biomejs/biome check --write src/  # Auto-fix issues
```

## Architecture

### Entry Point Flow
`src/index.ts` initializes components in order:
1. Config validation
2. Database initialization
3. Kubernetes controller (watches all CRDs)
4. Scheduler (executes monitor checks)
5. Notification delivery worker
6. Fastify API server

### Core Components

#### 1. Kubernetes Controller (`src/controller/`)
- **Informers** (`informers.ts`): Watchers for all 10 CRD types using Kubernetes informer pattern
- **Reconcilers**: Functional reconciliation pattern with pure functions
- **No spec mutation**: Controller only updates status subresources
- **Registry-based**: Informer registry tracks all watched resources

Key pattern: Reconcilers are pure functions that take current state and desired state, return operations to perform.

#### 2. Scheduler (`src/scheduler/`)
- **Priority Queue** (`queue.ts`): Min-heap implementation with O(1) peek
- **Deterministic Jitter** (`jitter.ts`): Prevents thundering herd with hash-based scheduling
- **Lease-based Locking** (`lock.ts`): Kubernetes Lease resource ensures singleton scheduler
- **100ms tick loop**: Checks for due jobs and executes them

Key pattern: Jobs are registered/unregistered by reconcilers, scheduler executes when due.

#### 3. Monitor Checkers (`src/checkers/`)
Each checker implements a common interface:
- `http.ts`: HTTP/HTTPS with status codes, content matching, TLS verification
- `tcp.ts`: TCP connection with send/expect pattern
- `dns.ts`: DNS queries with record type validation
- `ping.ts`: ICMP ping (platform detection for Darwin/Linux)
- `websocket.ts`: WebSocket connection testing
- `push.ts`: Push-based monitors (webhook receiver)
- `steam.ts`: Steam game server queries
- `kubernetes.ts`: Kubernetes resource health checks

All return standardized `CheckResult` type.

#### 4. Alerting System (`src/alerting/`)
- **State Transitions**: Detects monitor state changes (healthy → unhealthy, etc.)
- **Incident Management**: Creates/resolves incidents based on state
- **Policy-based Routing**: Routes events to providers via `NotificationPolicy` CRDs
- **8 Providers**: Slack, Discord, Telegram, SMTP, Webhook, PagerDuty, Pushover, Mattermost

Key pattern: Alert events are queued and processed by delivery worker with deduplication.

#### 5. Frontend (`web/`)
- **TanStack Router**: File-based routing in `web/src/routes/`
- **shadcn/ui**: Components in `web/src/components/ui/`
- **Vite**: Build system with hot module replacement
- **Embedding**: Built assets are served by Fastify from `dist/` directory

## CRD Types (10 Custom Resources)

All CRDs are defined in `src/types/crd/` with Zod schemas:

1. **KubeKumaSettings** (`settings.ts`): Cluster-scoped global config
2. **Monitor** (`monitor.ts`): Single health check definition
3. **MonitorSet** (`monitor-set.ts`): Bulk monitor definitions (inline, not child CRDs)
4. **NotificationProvider** (`notification-provider.ts`): Alert destination credentials
5. **NotificationPolicy** (`notification-policy.ts`): Event routing rules
6. **StatusPage** (`status-page.ts`): Public status page configuration
7. **MaintenanceWindow** (`maintenance-window.ts`): Planned maintenance (RRULE support)
8. **Silence** (`silence.ts`): Ad-hoc alert muting
9. **LocalUser** (`local-user.ts`): Local accounts (when auth.mode=local)
10. **ApiKey** (`api-key.ts`): API access tokens with scopes

**Important**: CRD schemas use Zod for validation. When adding new CRD fields:
1. Update Zod schema in `src/types/crd/{resource}.ts`
2. Update Kubernetes CRD YAML in `k8s/crds.yaml`
3. Update reconciler if logic changes

## Database Schema

Database is **only for runtime data** - configuration lives in CRDs:
- `heartbeats`: Check results (state, latency, reason, timestamp)
- `incidents`: Open/closed outages with duration tracking
- `notification_deliveries`: Alert delivery tracking and deduplication
- `audit_events`: Resource change history
- `crd_cache`: Materialized CRD state for fast queries

Use Drizzle migrations for schema changes:
```bash
bun run db:generate    # Generate migration from schema diff
bun run db:push        # Push changes directly (dev only)
```

## Functional Programming Patterns

This codebase uses functional programming:
- **Pure functions**: Reconcilers, checkers, and utilities are pure
- **Factory functions**: `createScheduler()`, `createReconciler()`, etc.
- **Composition**: Small functions composed into larger behaviors
- **Immutable state**: State updates return new state objects

When adding new features:
- Prefer pure functions over classes
- Use factory functions for complex stateful components
- Keep mutation localized to specific state objects

## Key Design Decisions

### Single Instance Architecture
- Kubernetes Lease ensures only one scheduler runs
- No distributed locking needed for scheduler
- API server can scale horizontally (read-only operations)

### GitOps Integration
- All configuration in CRDs (stored in Git)
- Application is read-only for spec changes
- Flux/Argo CD can deploy CRDs directly
- Controller watches and reconciles desired state

### Status Subresource Pattern
- Controller writes status only, never spec
- Status updates use subresource (requires RBAC for status)
- Prevents controller conflicts with GitOps tools

### Deterministic Jitter
- Monitor execution times are jittered to prevent thundering herd
- Jitter is deterministic based on job ID (consistent across restarts)
- Uses hash-based scheduling with configurable jitter window

## Adding a New Monitor Type

1. Create checker in `src/checkers/{type}.ts`:
   - Implement checker function with standard signature
   - Return `CheckResult` type
   - Handle errors gracefully

2. Update `src/checkers/index.ts`:
   - Export new checker
   - Add to type registry

3. Update CRD schema:
   - Add new type to `src/types/crd/monitor.ts` Zod schema
   - Update `k8s/crds.yaml` with new enum value

4. Register in reconciler:
   - Monitor reconciler already handles all types generically

## Adding a New Notification Provider

1. Create provider in `src/alerting/providers/{name}.ts`:
   - Implement `sendNotification()` function
   - Handle provider-specific authentication
   - Format message appropriately

2. Update `src/alerting/providers/index.ts`:
   - Import and register provider
   - Add to provider registry

3. Update CRD schema:
   - Add new provider type to `NotificationProvider` Zod schema
   - Update CRD YAML

## Testing Status

**Phases 1-5: COMPLETE**
- Foundation, database, CRDs
- Kubernetes controller & scheduler
- Alerting system with 8 providers
- 8 monitor checker types
- Status pages with public API
- Suppressions (silences + maintenance windows)

**Phases 6-9: In Progress**
- Authentication (OIDC, local users, API keys)
- Metrics & observability
- Frontend dashboard
- Timoni packaging

No test runner is currently configured. When adding tests:
- Use Bun's built-in test runner (`bun test`)
- Place tests alongside source files (e.g., `src/scheduler/index.test.ts`)

## Important File Locations

- **Entry point**: `src/index.ts`
- **Fastify routes**: `src/server/routes/`
- **Reconcilers**: `src/controller/reconcilers/`
- **Database schema**: `src/db/schema/`
- **CRD types**: `src/types/crd/`
- **Kubernetes manifests**: `k8s/`
- **Frontend routes**: `web/src/routes/`
- **UI components**: `web/src/components/`
