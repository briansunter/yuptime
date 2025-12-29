# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yuptime is a Kubernetes-native monitoring solution where all configuration is managed through Custom Resource Definitions (CRDs). It's designed as a single-instance application that runs entirely within Kubernetes with GitOps-ready workflows.

**Key Architecture Principle**: The controller only writes to status subresources, never to spec. The spec is the source of truth from CRDs.

## Tech Stack

- **Runtime**: Bun (>= 1.1.0)
- **Metrics Server**: Native HTTP or Fastify (port 3000)
- **Dashboards**: Grafana (external, user-managed)
- **Kubernetes**: @kubernetes/client-node with informers
- **Architecture**: Pure Kubernetes CRDs, no database
- **Linting/Formatting**: Biome

## Development Commands

```bash
bun install              # Install dependencies
bun run dev              # Start development server
bun run build            # Build TypeScript
bun run start            # Run production build
bun run type-check       # TypeScript type check without emitting
```

### Code Quality
```bash
bun run lint          # Run Biome linter
bun run lint:fix      # Auto-fix linting issues
bun run format        # Format code with Biome
bun run type-check    # TypeScript type check without emitting
```

## Architecture

### Entry Point Flow
`src/index.ts` initializes components in order:
1. Config validation
2. Kubernetes controller (watches all CRDs)
3. Job Manager (creates Kubernetes Jobs for checks)
4. Job Completion Watcher (processes check results)
5. Metrics Server (Prometheus scraping)

### Core Components

#### 1. Kubernetes Controller (`src/controller/`)
- **Informers** (`informers.ts`): Watchers for all 5 CRD types using Kubernetes informer pattern
- **Reconcilers**: Functional reconciliation pattern with pure functions
- **No spec mutation**: Controller only updates status subresources
- **Registry-based**: Informer registry tracks all watched resources

Key pattern: Reconcilers are pure functions that take current state and desired state, return operations to perform.

#### 2. Job Manager (`src/controller/job-manager/`)
- **Kubernetes Job Execution**: Creates isolated Jobs for each monitor check
- **Deterministic Jitter**: Prevents thundering herd with hash-based scheduling
- **Completion Watcher**: Watches for Job completions and processes results

Key pattern: Each check runs in its own Kubernetes Job pod with direct status updates.

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
- **Alertmanager Integration**: Sends alerts directly to Alertmanager via webhook
- **Configuration**: Each Monitor has optional `alertmanagerUrl` field

Key pattern: State changes trigger direct POST to Alertmanager `/api/v1/alerts` endpoint.

#### 5. Checker Executor (`src/checker-executor/`)
- **Job-Based Execution**: Each monitor check runs in isolated Kubernetes Job pod
- **Direct K8s API Updates**: Updates Monitor CRD status via service account token (no database)
- **In-Cluster Authentication**: Reads service account token from `/var/run/secrets/kubernetes.io/serviceaccount/token` (required)
- **RBAC Requirements**: Needs `monitors/status` patch/update permissions (see `timoni/yuptime/templates/rbac.cue`)

**Important**: The checker executor has NO database access. Check results are written directly to Monitor CRD status subresource via Kubernetes API using merge patch format. Requires in-cluster execution.

## CRD Types (5 Custom Resources)

All CRDs are defined in `src/types/crd/` with Zod schemas:

1. **YuptimeSettings** (`settings.ts`): Cluster-scoped global config
2. **Monitor** (`monitor.ts`): Single health check definition
3. **MonitorSet** (`monitor-set.ts`): Bulk monitor definitions (inline, not child CRDs)
4. **MaintenanceWindow** (`maintenance-window.ts`): Planned maintenance (RRULE support)
5. **Silence** (`silence.ts`): Ad-hoc alert muting

**Important**: CRD schemas use Zod for validation. When adding new CRD fields:
1. Update Zod schema in `src/types/crd/{resource}.ts`
2. Update Kubernetes CRD YAML in `k8s/crds.yaml`
3. Update reconciler if logic changes

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

### Checker Executor Architecture
- **Isolated Execution**: Each monitor check runs in a separate Kubernetes Job pod
- **Stateless**: No database connection; writes results directly to Monitor CRD status
- **Service Account Auth**: Uses in-cluster service account token for Kubernetes API access
- **Merge Patch Format**: Status updates use `application/merge-patch+json` content-type
- **RBAC Isolation**: Checker service account has minimal permissions (monitors get/update, monitors/status patch/update)

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

## Testing

### Running Tests
```bash
bun run test           # Run all tests (watch mode)
bun run test:ci        # Run tests in CI mode (no watch)
bun run test:coverage  # Run with coverage report
```

### Testing Checker Executor Locally
The checker executor can be tested locally against a Kubernetes cluster:
```bash
# Uses kubeconfig for authentication when not in-cluster
bun src/checker-executor/cli.ts <namespace> <monitor-name>
```

When running in Kubernetes Jobs, it automatically uses service account token from `/var/run/secrets/kubernetes.io/serviceaccount/token`.

Test files use Bun's built-in test runner and are placed alongside source files:
- `src/controller/job-manager/jitter.test.ts`
- `src/lib/crypto.test.ts`
- `src/lib/rrule.test.ts`
- `src/lib/selectors.test.ts`
- `src/lib/uptime.test.ts`

### Pre-commit Hooks
Husky automatically runs before commits:
- `bun run lint` - Biome linting
- `bun run type-check` - TypeScript type checking
- `bun run test:ci` - Run tests in CI mode

**Note**: E2E tests are NOT run in pre-commit (only in CI workflow)

## Implementation Status

**Phases 1-5: COMPLETE**
- Foundation, CRDs
- Kubernetes controller & job manager
- Alertmanager integration (direct POST)
- 8 monitor checker types
- Suppressions (silences + maintenance windows)
- Database-free checker executor (direct K8s API updates)
- Pre-commit hooks with lint, type-check, and tests
- Removed notification providers, auth, status pages, incidents, database

**Phases 6-9: In Progress**
- Metrics & observability
- Timoni packaging
- Documentation updates

## Important File Locations

- **Entry point**: `src/index.ts`
- **Fastify routes**: `src/server/routes/`
- **Reconcilers**: `src/controller/reconcilers/`
- **Database schema**: `src/db/schema/`
- **CRD types**: `src/types/crd/`
- **Kubernetes manifests**: `k8s/`
- **Frontend routes**: `web/src/routes/`
- **UI components**: `web/src/components/`
