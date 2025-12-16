# KubeKuma Architecture

## Design Philosophy

KubeKuma is built with the following architectural principles:

1. **Functional Programming**: Prefer pure functions and composition over classes and inheritance
2. **Kubernetes-Native**: Everything is a CRD; no hidden mutable state in the UI
3. **Single Instance**: One pod handles API, UI, scheduler, and controller with Kubernetes-enforced singleton semantics
4. **GitOps-Ready**: Configuration lives in Git, app only writes status and runtime data

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    KubeKuma Pod                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Fastify API │  │  React SPA   │  │  Scheduler   │ │
│  │   (port 3000)│  │   (embedded) │  │   (checks)   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                                      │       │
│  ┌──────┴────────────────────────────────────┴──────┐ │
│  │     Kubernetes Controller (CRD Watchers)        │ │
│  └─────────────────────────────────────────────────┘ │
│         │                                             │
│  ┌──────┴──────────────────────────────────────────┐ │
│  │  Database (SQLite/PostgreSQL)                   │ │
│  │  - heartbeats, incidents, notifications, audit │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
└─────────────────────────────────────────────────────┘
         │
         └─→ Kubernetes API
              (CRDs, Secrets, Leases)
```

## Core Components

### 1. Kubernetes Controller (src/controller/)

**Responsibilities:**
- Watch all 10 CRD types for changes
- Validate CRDs against Zod schemas
- Reconcile resources into desired state
- Update status subresources

**Key Files:**
- `k8s-client.ts` - Kubernetes API wrapper
- `informers.ts` - CRD watchers with caching
- `reconcilers/` - Validation and reconciliation logic

**Functional Design:**
- Registry pattern using Maps instead of classes
- Factory functions for creating reconcilers
- Composition of validators using curried functions
- Pure validation functions separated from side effects

**Example Reconciliation Flow:**
```typescript
// Create validator by composing multiple checks
const validateMonitor = composeValidators(
  commonValidations.validateName,
  commonValidations.validateSpec,
  createZodValidator(MonitorSchema),
  validateMonitorSchedule,
  validateMonitorTarget
);

// Run validation and update status accordingly
const validation = validate(validateMonitor)(resource);
if (!validation.valid) {
  await markInvalid(...);
} else {
  await reconcile(resource);
  await markValid(...);
}
```

### 2. Scheduler (src/scheduler/)

**Responsibilities:**
- Manage priority queue of monitors
- Execute checks on schedule
- Apply deterministic jitter (prevents thundering herd)
- Acquire singleton lock via Kubernetes Lease
- Store results in database

**Key Files:**
- `index.ts` - Main scheduler loop
- `queue.ts` - Min-heap priority queue
- `jitter.ts` - Deterministic jitter calculation
- `lock.ts` - Kubernetes Lease-based locking

**Functional Design:**
- Queue as pure data structure with functional operations
- Scheduler as composition of separate concerns:
  - Lock acquisition (Lease-based)
  - Priority queue management
  - Check execution
  - Result handling

**Singleton Lock Mechanism:**
```typescript
// Acquire lock on startup
const locked = await acquireLock();
if (!locked) {
  logger.warn("Running in standby mode");
  return;
}

// Keep lock alive with periodic renewal
startLockRenewal(); // Every 10 seconds

// Clean shutdown releases lock
await releaseLock();
```

### 3. Monitor Checkers (src/checkers/)

**Implemented Checkers:**
- HTTP/HTTPS with status codes, headers, redirects, TLS
- Keyword content matching
- JSON Query with JSONPath
- TCP connect with optional send/expect
- DNS resolution with record type validation
- Ping (ICMP with fallbacks)

**Pending Checkers:**
- WebSocket
- Steam game server query
- Kubernetes endpoint health
- Docker health check
- Push-based monitors

**Functional Design:**
- Each checker: `(monitor, timeout) => Promise<CheckResult>`
- Unified CheckResult type
- Dispatcher pattern in `executeCheck()`
- Automatic error classification (TIMEOUT, DNS_NXDOMAIN, etc.)

### 4. Fastify API Server (src/server/)

**Responsibilities:**
- Expose REST API for UI
- Health checks (`/health`, `/ready`)
- Push monitor endpoints
- Public status pages
- Prometheus metrics
- Static SPA serving

**Routes:**
- `/api/v1/monitors` - CRUD operations
- `/api/v1/status-pages/:slug` - Public pages
- `/metrics` - Prometheus format
- `/push/:token` - Push monitor updates
- `/` - SPA fallback

### 5. Database Layer (src/db/)

**Schemas:**
- `heartbeats` - Check results (state, latency, reason)
- `incidents` - Open/closed outages
- `notification_deliveries` - Alert delivery tracking
- `audit_events` - Resource change history
- `crd_cache` - Materialized CRD state for fast queries

**Design:**
- Drizzle ORM with SQLite/PostgreSQL abstraction
- No configuration stored in DB (all in CRDs)
- Dual-database support via conditional schema definitions

### 6. Frontend (web/)

**Tech Stack:**
- React + TanStack Router
- Tailwind CSS + shadcn/ui
- Vite build system
- Embedded in Fastify as static assets

**Structure:**
- `routes/` - File-based routing with TanStack Router
- `components/` - shadcn/ui + custom components
- `hooks/` - API integration and state
- `lib/` - Utilities and API client

## Reconciliation Pattern

KubeKuma uses a functional reconciliation pattern based on Kubernetes operators:

```typescript
interface ReconcilerConfig {
  kind: string;
  plural: string;
  zodSchema: ZodSchema;
  validator: ValidatorFn;           // (resource) => ValidationResult
  reconciler: ReconcilerFn;         // (resource, ctx) => Promise<void>
  deleteHandler?: DeleteHandlerFn;  // (ns, name) => Promise<void>
}

// Each reconciler is just functions, not classes
const monitorReconciler = createMonitorReconciler();

// Handler wraps validation + reconciliation + status updates
const handler = createReconciliationHandler(monitorReconciler);

// Register with informer
registry.registerReconciler(informerRegistry, "Monitor", handler);
```

**Flow:**
1. CRD Watcher detects change (ADDED/MODIFIED/DELETED)
2. Call registered handler
3. Handler validates using Zod schema + custom validators
4. If invalid: update status with errors, return
5. If valid: run reconciliation logic
6. Mark as valid/reconciled in status

## Validation Strategy

Validation is composed of layers:

```typescript
const validateMonitor = composeValidators(
  // Layer 1: Basic metadata
  commonValidations.validateName,
  commonValidations.validateSpec,

  // Layer 2: Schema validation (Zod)
  createZodValidator(MonitorSchema),

  // Layer 3: Semantic validation (business logic)
  validateMonitorSchedule,
  validateMonitorTarget,
  validateMonitorTypingRules
);
```

Each validator is a pure function: `(resource) => string[]` (empty if valid)

## Scheduler Execution Model

The scheduler runs a single loop per pod:

```typescript
// Startup
const locked = await acquireLock();
if (!locked) return; // Standby mode

startLockRenewal();
await runSchedulerLoop();

// Main loop (100ms tick)
async function runSchedulerLoop() {
  const nextJob = queue.peek();
  if (nextJob && nextJob.nextRunAt <= now) {
    const job = queue.pop();
    const result = await executeCheck(job);
    await storeResult(result);
    queue.add(rescheduleJob(job));
  }
}
```

**Concurrency Model:**
- Single-threaded JavaScript event loop
- Configurable concurrent limit (200 network checks, 20 privileged)
- TODO: Implement worker thread pool for CPU-bound operations

**Jitter:**
```typescript
// Deterministic: same monitor always gets same jitter
jitter = hash(namespace/name) % intervalSeconds
nextRun = now + intervalSeconds + jitter
```

This prevents all monitors from running simultaneously (thundering herd).

## Data Flow: Monitor Check to Alert

```
1. Scheduler pops Monitor from queue
   ↓
2. Execute checker (HTTP, DNS, TCP, etc.)
   ↓
3. Get result (state, latency, reason)
   ↓
4. Store heartbeat in database
   ↓
5. Update Monitor.status.lastResult
   ↓
6. Detect state transition (up→down, down→up, etc.)
   ↓
7. If state changed:
   - Create Incident if down
   - Match policies via selectors
   - Route to notification providers
   ↓
8. Check for suppressions (maintenance window, silence)
   ↓
9. Send alerts if not suppressed
   ↓
10. Track delivery attempt
```

## CRD Status Management

All CRDs follow Kubernetes status pattern:

```yaml
status:
  observedGeneration: 3          # Tracks latest seen spec generation
  conditions:
    - type: Valid
      status: "True"
      reason: Validated
      message: Resource spec is valid
      lastTransitionTime: "2025-12-15T10:00:00Z"
    - type: Reconciled
      status: "True"
      reason: ReconcileSuccess
    - type: Ready
      status: "True"
      reason: ResourceReady
```

**Condition Transitions:**
- `Valid=False` → `Reconciled` skipped, `Ready=False`
- `Valid=True` + reconcile success → all `True`
- Reconcile error → `Reconciled=False`, `Ready=False`

## Environment Setup

**Required Env Vars:**
- `DATABASE_URL` - SQLite or PostgreSQL connection
- `KUBE_NAMESPACE` - Namespace for system resources (default: monitoring)
- `AUTH_MODE` - `oidc` or `local`
- `LOG_LEVEL` - debug, info, warn, error

**Kubernetes Config:**
- In-cluster: Automatically loaded
- Local: Uses KUBECONFIG env var

## Security Model

**No Secrets in Configs:**
- All credentials referenced via Kubernetes Secrets
- CRDs contain only `secretRef` pointers
- App resolves secrets at reconciliation time
- Secrets cached for 5 minutes to reduce API calls

**RBAC:**
- Single ServiceAccount with minimal permissions
- Read-only access to CRDs (except status)
- Read access to Secrets
- Write access to Lease (for scheduler lock)

**GitOps Mode:**
- `spec.mode.gitOpsReadOnly: true` disables all write endpoints
- UI hides mutation buttons
- API returns 403 on PATCH/POST requests
- Flux/Argo manage Git→Kubernetes sync

## Performance Characteristics

**Scheduler:**
- O(1) next job lookup (peek min-heap)
- O(log n) reschedule (push after pop)
- 100ms loop tick with batching
- Configurable concurrency limits

**Controller:**
- Informer caching for fast list operations
- Batch validation of multiple CRDs
- Database caching of CRD state
- Lease-based singleton (no active polling)

**Database:**
- Heartbeats: time-series optimized (can downsample)
- Incidents: indexed by (namespace, name, time)
- Indexes: (kind, namespace, name) for crd_cache

## Testing Strategy (TBD)

- Unit tests for validators, jitter, queue operations
- Integration tests for controller + K8s API mocking
- E2E tests with kind cluster
- Load tests for scheduler performance

## Deployment Model

**Single Container:**
- Fastify API + React SPA + Controller + Scheduler
- StatefulSet with replicas: 1 (enforced by controller startup)
- PVC for SQLite (or external PostgreSQL)
- ServiceAccount with limited RBAC

**Scaling:**
- Horizontal scaling not supported (by design)
- CRDs provide natural fan-out to external systems
- Use multiple instances for high availability (future)

## Monitoring & Observability

**Metrics:**
- `/metrics` endpoint (Prometheus format)
- Monitor state gauges (up, down, pending)
- Check latency histograms
- Uptime percentages
- Scheduler job queue depth

**Logging:**
- Structured logging via pino
- JSON output in production
- Pretty printing in development
- Contextual fields: kind, namespace, name, error

**Health Probes:**
- `/health` - Always OK if process is running
- `/ready` - OK only if scheduler has acquired lock + controller running
