# Architecture

Yuptime is a Kubernetes-native monitoring controller. Monitor configuration is
declarative, check results live in CRD status, metrics are exported to
Prometheus, and alert transitions are sent directly to Alertmanager.

## Runtime overview

```text
Yuptime Pod
├── controller container
│   ├── CRD informers and reconcilers
│   ├── absolute-slot Check Engine
│   ├── bounded admission queue and retries
│   ├── ordered status publisher
│   └── /health, /ready, and /metrics on port 3000
└── checker sidecar
    ├── loopback-only attempt server on 127.0.0.1:3001
    └── fixed pool of persistent worker processes
        └── HTTP, TCP, DNS, ping, database, gRPC, and other checks
```

The controller and sidecar share the Pod network namespace, so their protocol
uses loopback and is not exposed through a Service. The sidecar never schedules
checks and never writes Kubernetes status.

## Check flow

```text
Monitor informer event
        |
        v
Check Engine registry and schedule heap
        |
        v
bounded oldest-slot-first queue
        |
        v
idle sidecar worker -> target
        |
        v
ordered result publisher
        |
        +-> Monitor status subresource
        +-> Prometheus metrics
        +-> Alertmanager transition
```

The Check Engine owns one immutable sequence of schedule slots per Monitor.
Completion time, retry duration, queue delay, and Kubernetes API latency never
move future slots. Missed slots are coalesced into at most one catch-up run,
then execution returns to the original phase.

There is at most one queued or running check per Monitor. Global concurrency
and queue capacity are fixed configuration, so overload cannot create an
unbounded number of processes or Kubernetes objects.

## Worker isolation

Workers are persistent subprocesses, but each handles only one attempt at a
time. Every attempt receives:

- a validated Monitor snapshot;
- a deterministic execution identity;
- a hard deadline and cancellation signal;
- an attempt-local credential resolver.

Credentials are not copied into process-global environment variables. If a
worker crashes, hangs past its deadline, or cannot cancel cleanly, the
supervisor kills and replaces that worker without restarting the Pod or
growing the pool.

The controller container drops all Linux capabilities. The checker container
also drops all capabilities, then adds only `NET_RAW` for ping support.

## Ordered status ownership

The controller is the sole Monitor status writer. Before publishing a result it
re-reads the Monitor and rejects:

- a different UID or generation;
- a result whose `scheduledAt` is not newer;
- a status update that loses its resource-version race.

Conflicts are re-read and retried. Metrics and alerts are emitted only after the
status update commits, preventing a stale attempt from moving state backward or
emitting a false transition.

```yaml
status:
  observedGeneration: 4
  lastResult:
    executionId: 1ab4d...
    scheduledAt: "2026-07-16T10:00:00.000Z"
    startedAt: "2026-07-16T10:00:00.041Z"
    checkedAt: "2026-07-16T10:00:00.172Z"
    state: up
    attempts: 1
    latencyMs: 131
  nextRunAt: "2026-07-16T10:01:00.000Z"
```

## Readiness and observability

Liveness reports whether the process is alive. Readiness additionally requires:

- completed informer startup;
- a recent scheduler tick;
- a ready runner and healthy worker pool;
- no queue stall beyond the readiness threshold.

Target failures do not make Yuptime unready. Scheduler delay, queue wait, start
delay, in-flight checks, overdue monitors, retries, coalescing, worker state,
and worker replacements are exported as bounded-cardinality metrics.

## Kubernetes objects

The default `sidecar` mode creates one Deployment Pod and no per-check Jobs or
Pods. Job/Pod RBAC and the checker ServiceAccount are omitted.

`execution.mode: jobs` is an installation-wide rollback adapter. It uses the
same Check Engine and ordered publisher, but one attempt is executed by one
Kubernetes Job with `ttlSecondsAfterFinished`. It is not an automatic fallback
and must not run concurrently with a sidecar-mode controller against the same
Monitor set.

## Scaling boundary

The worker pool is sized by concurrent work, not checker type:

```text
required workers ~= checks per second * p95 attempt duration * headroom
```

Queue wait, busy workers, and overdue monitors show when vertical capacity is
insufficient. The current controller is intentionally singleton. Scaling past
one Pod requires explicit monitor sharding with one status owner per Monitor;
uncoordinated replicas and per-check Jobs are not horizontal scaling.

## Data ownership

| Data | Source of truth |
|---|---|
| Monitor configuration | `Monitor.spec` |
| Current and previous results | `Monitor.status` |
| Runtime health and aggregate observations | Prometheus |
| Alert routing and delivery policy | Alertmanager |
| Deployment, CRDs, and RBAC | Timoni/CUE module |

The controller never mutates CRD specs. Timoni templates are authoritative for
maintainers; Helm, static manifests, and `k8s/crds.yaml` are deterministic
generated mirrors whose complete resource contents are checked for parity.

See [Checker execution redesign](./checker-execution-redesign.md) for the exact
timing model, failure semantics, migration details, and acceptance criteria.
