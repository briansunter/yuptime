# Checker execution redesign

## Decision

Replace completion-driven, one-Job-per-check execution with an
absolute-deadline scheduler in the controller and a persistent checker sidecar
in the same Pod.

The sidecar owns a fixed-size pool of long-lived checker processes. A process
handles many attempts over its lifetime; the supervisor replaces it only when
it crashes, exceeds a hard deadline, or cannot cancel cleanly. Steady-state
monitoring creates no Jobs or Pods.

Kubernetes Job execution remains an installation-wide rollback mode for one
release. It is not a per-monitor fallback and it must use the same scheduler;
Job completion must never schedule the next run.

This is an execution-engine change. The `Monitor`, `MonitorSet`, maintenance,
silence, metrics, and alerting product surfaces remain stable. Additions to
`Monitor.status` are allowed because they are needed for ordering and schedule
recovery; `Monitor.spec` does not change.

## Why the first pool design was incomplete

The original proposal put a bounded pool directly in the controller process.
That removes Job churn, but it leaves four important problems unresolved:

1. Several checkers obtain credentials from `process.env`. Concurrent monitors
   cannot safely replace process-global credentials.
2. ICMP checks need the `ping` executable and `NET_RAW`. Giving those to the
   controller weakens its isolation.
3. An `AbortSignal` is cooperative. A checker that ignores cancellation can
   consume a pool slot forever unless there is a process the supervisor can
   terminate.
4. The current cadence is completion-driven. It waits one interval, adds jitter
   again, and only then creates the next Job. Check duration, Pod startup, API
   latency, and repeated jitter all accumulate as drift.
5. Production paths use `jitterPercent || 5`, so the valid value `0` is silently
   replaced with five percent. `initialDelaySeconds`, schedule retries, and
   `nextRunAt` are not part of the actual scheduling loop.
6. Job results are not tied to a schedule slot or Monitor generation. Concurrent
   Jobs can overwrite newer status, while status writes themselves trigger
   another Monitor reconciliation.

A separately scalable checker Deployment was also considered. It would require
a Service, request authentication, distributed admission, and result-delivery
semantics even though Yuptime currently supports one active controller. A
sidecar provides the required process and resource isolation without adding a
distributed-system seam. The loopback runner interface can later support a
separate Deployment if scaling evidence justifies it.

## Target topology

```text
Yuptime Pod

  controller container
  ┌──────────────────────────────────────────────────────────────┐
  │ Monitor informer                                             │
  │       │                                                      │
  │       v                                                      │
  │ absolute-deadline scheduler -> keyed admission queue         │
  │                                      │                       │
  │                                      v                       │
  │                              SidecarRunner adapter            │
  │                                      │ loopback HTTP          │
  │                                      v                       │
  │ result publisher <- attempt result / structured failure      │
  │       │                                                      │
  │       +-> Monitor status                                     │
  │       +-> Prometheus metrics                                 │
  │       +-> alert state transitions                            │
  └──────────────────────────────────────────────────────────────┘
                                         │
  checker sidecar                        v
  ┌──────────────────────────────────────────────────────────────┐
  │ checker supervisor                                           │
  │       │                                                      │
  │       +-> persistent worker 1 -> checker modules             │
  │       +-> persistent worker 2 -> checker modules             │
  │       +-> persistent worker N -> checker modules             │
  │                                                              │
  │ hard deadline: terminate worker, return timeout, replace it  │
  └──────────────────────────────────────────────────────────────┘
```

The scheduler, admission queue, and result publisher form one deep Check Engine
module. Reconcilers only upsert or remove monitors. They do not create execution
objects, own timers, inspect worker state, or reschedule from completion events.

## Module interfaces

### Check Engine

The Check Engine interface is deliberately small:

```ts
interface CheckEngine {
  start(): Promise<void>;
  upsert(monitor: Monitor): void;
  remove(monitorId: string): void;
  snapshot(): CheckEngineSnapshot;
  stop(graceMs: number): Promise<void>;
}
```

Behind that interface it owns:

- the monitor registry and schedule heap;
- one wake-up timer for the earliest deadline, not one timer per monitor;
- the keyed admission queue;
- retry and coalescing policy;
- cancellation on disable, deletion, or generation change;
- result publication and readiness state.

This gives reconciler callers leverage and keeps scheduling bugs local to one
test surface.

### Check Runner seam

The runner seam has two real adapters during migration:

```ts
interface CheckRunner {
  runAttempt(request: AttemptRequest, signal: AbortSignal): Promise<AttemptResult>;
  ready(): Promise<boolean>;
  shutdown(graceMs: number): Promise<void>;
}
```

- `SidecarRunner` is the default adapter and uses loopback HTTP.
- `KubernetesJobRunner` is the temporary rollback adapter.

The scheduler owns retries. A runner executes exactly one attempt and does not
publish status, emit alerts, or schedule more work. This keeps completion order
and retry behavior identical across adapters.

### Checker supervisor

The sidecar supervisor is an internal module, not another scheduler. It accepts
attempts only from the controller, assigns each to one idle worker process, and
returns one structured result.

Each worker:

- handles one attempt at a time;
- remains alive for later attempts;
- resolves secret references for the current monitor;
- receives an attempt deadline and cancellation signal;
- is terminated and replaced if the hard deadline expires;
- clears attempt-local state before becoming idle.

The supervisor does not grow the pool under load. Capacity is fixed by
configuration.

## Exact timing model

Scheduling is based on immutable slots, not on completion time.

For a monitor:

```text
I = intervalSeconds * 1000
A = metadata.creationTimestamp + initialDelaySeconds * 1000
J = stableHash(namespace, name, uid) modulo (I * jitterPercent / 100)
S(n) = A + J + n * I
```

`J` is calculated once as a stable phase offset. It is not added again after
each check. With `jitterPercent: 0`, `J` is zero. A missing
`creationTimestamp` is treated as the first observation time only in unit tests
or malformed fixtures; real Kubernetes objects always provide it.

The scheduler records three different times:

- `scheduledAt`: the immutable slot `S(n)`;
- `startedAt`: when a worker actually begins the attempt;
- `checkedAt`: when the final result is produced.

Only `scheduledAt` determines the next run. Execution duration, retries, queue
delay, API latency, and result publication never move future slots.

### Timer and clock behavior

- The schedule heap is ordered by `scheduledAt`.
- One timer wakes for the earliest slot, then drains every due entry.
- Wall-clock time selects schedule slots. A monotonic clock measures sleeps,
  queue wait, attempt duration, and shutdown grace periods.
- The timer wakes periodically even for distant deadlines and recomputes from
  wall time, so suspend/resume and clock corrections do not leave stale delays.
- Fake-clock tests exercise both wall-clock jumps and monotonic passage.

### Restarts and missed slots

On startup, the informer rebuilds the registry. The scheduler uses the latest
published `lastResult.scheduledAt` to find the first later slot.

If one or more slots were missed while Yuptime was down, they are coalesced into
one immediate catch-up run whose `scheduledAt` is the latest missed slot. Older
missed slots are counted, not replayed. The following run returns to the
original slot sequence.

This produces at-least-once execution across an abrupt controller restart. A
duplicate catch-up is acceptable; monotonic result publication prevents an
older result from overwriting a newer one.

### Overload and coalescing

There is at most one queued or running run per monitor.

If another slot becomes due while that monitor is queued or running:

- do not enqueue a second copy;
- remember only the newest due slot;
- increment the coalesced counter;
- after the current run finishes, enqueue one catch-up only if the remembered
  slot is still due.

Admission is oldest-deadline-first across monitors. When the bounded queue is
full, due monitors stay represented in the schedule heap and contribute to the
overdue gauge. The engine never creates more workers or execution objects to
recover from backlog.

Retries belong to one scheduled run. Retry delay and attempt timeouts do not
shift later slots. If retries overlap later slots, those slots follow the same
coalescing rule.

## Attempt identity and result ordering

Each run has a deterministic identity derived from:

```text
monitor UID + observed generation + scheduledAt
```

The result publisher adds these status fields through the CUE-first CRD
workflow:

```yaml
status:
  lastResult:
    executionId: "..."
    scheduledAt: "2026-07-16T10:00:00.000Z"
    startedAt: "2026-07-16T10:00:00.041Z"
    checkedAt: "2026-07-16T10:00:00.172Z"
    attempts: 1
    state: up
  nextRunAt: "2026-07-16T10:01:00.000Z"
```

Publication uses a resource-version-guarded status update with conflict retry.
Before each retry it reads the current status and discards a candidate whose
`scheduledAt` is not newer. This prevents late responses, cancelled generations,
and Job rollback results from moving status backwards.

Metrics and alert transitions are emitted only after the status update wins.
The checker sidecar never writes Monitor status directly.

## Credential and execution context

Persistent concurrency requires removing checker credentials from
`process.env`.

Checker modules receive an attempt-local context:

```ts
interface CheckContext {
  signal: AbortSignal;
  resolveSecret(ref: SecretRef, defaultNamespace: string): Promise<string>;
  wallNow(): Date;
  monotonicNow(): number;
}
```

HTTP auth, OAuth, MySQL, PostgreSQL, Redis, headers, and CA bundles all resolve
their declared secret references through this context. No request mutates
process-global environment variables, and secret values are never sent over
the controller-to-sidecar request. The sidecar reads only the references in the
validated Monitor it receives.

The legacy Job adapter may keep environment injection during the rollback
window, but it must not be used by the sidecar path.

## Sidecar protocol and failure semantics

The checker server listens on `127.0.0.1` inside the shared Pod network
namespace. It has no Service and no externally reachable port.

The protocol contains a version, execution identity, validated Monitor,
attempt number, and deadline. Responses are bounded and schema-validated.
Arbitrary error stacks or secret values are not returned.

Failure behavior is explicit:

- connection unavailable: keep the run queued with bounded backoff;
- request deadline: abort, then terminate and replace the worker if it does not
  stop within a short grace period;
- worker crash: fail only that attempt and replace the worker;
- monitor disabled or deleted: cancel queued work and abort active work;
- monitor generation changed: cancel the old generation and reject any late
  result from it;
- controller shutdown: stop admission, drain for the configured grace period,
  abort remaining attempts, then stop the sidecar adapter;
- sidecar saturation: remain within configured concurrency and expose queue
  delay; never fall back to Jobs automatically.

Automatic fallback to Jobs is forbidden because an unhealthy sidecar could
otherwise trigger exactly the Kubernetes API storm this design removes.

## Kubernetes packaging

The Timoni module remains authoritative. Add an `execution` configuration:

```cue
execution: {
  mode:                 *"sidecar" | "jobs"
  concurrency:          *4 | int & >=1 & <=64
  queueCapacity:        *256 | int & >=1
  shutdownGraceSeconds: *15 | int & >=0
}
```

In `sidecar` mode the existing Deployment contains:

- the controller container, without `NET_RAW`;
- the checker container, with its own resources and only the capability needed
  for ping;
- an exec liveness probe for the checker supervisor;
- controller readiness that fails when the scheduler cannot make progress or
  the sidecar is unavailable.

The default NetworkPolicy uses an allow-all egress rule because uptime targets
can use arbitrary TCP or UDP ports. `commonPorts` is available as an explicit
restrictive opt-in for installations whose complete target inventory fits the
built-in allowlist; it must not be the default for a multi-protocol checker.

Job and Pod RBAC, the checker ServiceAccount, `JOB_TTL_SECONDS`, and Job cleanup
are rendered only in `jobs` mode. The controller Pod identity already reads the
Monitor and referenced Secrets required by the sidecar; this permission should
be narrowed to `get` where current code no longer needs broader verbs.

Timoni changes must be mirrored into Helm and static manifests through the
existing generation commands.

## Observability and readiness

Add bounded-cardinality metrics:

- `yuptime_scheduler_last_tick_timestamp_seconds`;
- `yuptime_scheduler_overdue_monitors`;
- `yuptime_check_queue_depth`;
- `yuptime_checks_in_flight`;
- `yuptime_check_queue_wait_seconds`;
- `yuptime_check_start_delay_seconds` (`startedAt - scheduledAt`);
- `yuptime_checks_total{type,result,reason}`;
- `yuptime_check_duration_seconds{type}`;
- `yuptime_check_retries_total{type,reason}`;
- `yuptime_check_coalesced_total{reason}`;
- `yuptime_checker_worker_restarts_total{reason}`.

Do not label these metrics with URLs, execution IDs, Pod names, error messages,
or other unbounded values.

Readiness returns failure when:

- informer startup has not completed;
- the scheduler is stopped or its last tick is stale;
- the selected runner is unavailable;
- all worker processes are unhealthy;
- the oldest queued run has made no progress beyond a configured threshold.

Target failures do not affect Yuptime readiness.

## Capacity and scaling boundary

Checker type does not determine process count. Every worker can execute any
supported checker, and the fixed pool is sized for concurrent attempts across
all types:

```text
required workers ~= checks per second * p95 attempt duration * headroom
```

For example, 6,000 one-minute monitors produce 100 checks per second. At a
200 ms p95 duration, 20 workers are occupied on average; a practical starting
point is 30-40 workers after burst and failure headroom. Queue wait, start
delay, busy workers, and overdue monitors show when that estimate is too low.

This release scales one controller Pod vertically because the repository still
assumes one active controller. If measured demand exceeds one Pod's CPU,
network, file-descriptor, or worker limit, the next architecture is explicit
monitor sharding with single-owner publication. Running uncoordinated replicas
or returning to per-check Jobs is not a horizontal-scaling strategy.

## External design references

The design follows the relevant primary guidance:

- [Prometheus instrumentation practices](https://prometheus.io/docs/practices/instrumentation/)
  recommend long-running processing for frequent work and direct metrics for
  work totals, errors, latency, in-progress work, queue wait, and worker-pool
  use.
- [Kubernetes startup, liveness, and readiness probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
  give startup, deadlock recovery, and traffic-readiness separate meanings.
- [Kubernetes Pod networking](https://kubernetes.io/docs/concepts/services-networking/)
  allows containers in one Pod to communicate over loopback, so the checker
  protocol needs no Service or exposed port.
- [Kubernetes NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
  defines egress rules as additive allowlists and documents `egress: [{}]` as
  the explicit allow-all form used for arbitrary monitor destinations.
- [Kubernetes Linux security constraints](https://kubernetes.io/docs/concepts/security/linux-kernel-security-constraints/)
  support dropping all capabilities and adding only `NET_RAW` to the checker
  container that performs ping checks.
- [Kubernetes Job cleanup](https://kubernetes.io/docs/concepts/workloads/controllers/job/)
  recommends `ttlSecondsAfterFinished` for unmanaged Jobs; the rollback adapter
  sets it, while the default path creates no Jobs at all.
- [Prometheus blackbox exporter](https://github.com/prometheus/blackbox_exporter)
  provides the established outer-deadline pattern: pass a slightly smaller
  attempt timeout into probing and preserve probe timing separately.

## Migration sequence

1. Build the absolute-deadline scheduler behind the Check Engine interface and
   use the existing Job implementation as its first adapter. Delete all
   completion-driven rescheduling and per-monitor timer chains.
2. Move status publication, metrics, and alert transitions into the result
   publisher. Add execution identity and resource-version ordering tests.
3. Introduce `CheckContext` and remove process-global credentials from the
   checker modules.
4. Add the checker supervisor, persistent worker protocol, and `SidecarRunner`.
5. Add conditional Timoni packaging, then regenerate and validate Helm and
   static manifests.
6. Run the same deterministic monitors through both adapters in separate test
   namespaces and compare states, attempts, timing, and alerts.
7. Make `sidecar` the default. Keep `jobs` as an explicit rollback setting for
   one stable release, then remove Job execution and its RBAC if no unsupported
   isolation requirement appears.

At no point do both adapters write results for the same Monitor.

## Acceptance criteria

- A two-hour cluster run with six one-minute monitors creates zero checker Jobs
  and zero checker Pods after the Yuptime Pod is ready in `sidecar` mode.
- Across 1,000 fake-clock intervals, consecutive `scheduledAt` values differ by
  exactly the configured interval with no accumulated jitter or execution
  drift.
- A five-second check on a 60-second schedule does not move the next slot by
  five seconds.
- Under available capacity, start delay stays within one scheduler tick; queue
  delay is measured separately and never hidden as schedule drift.
- Restart after multiple missed intervals produces at most one immediate
  catch-up per monitor and then returns to the original phase.
- Queue saturation never exceeds configured concurrency or queue capacity and
  never creates Kubernetes execution objects.
- Concurrent monitors using different Secrets cannot observe each other's
  credentials.
- A deliberately hung checker is terminated at its hard deadline, its worker
  is replaced, and later checks complete successfully.
- Disable, delete, and generation-change races cannot publish stale results.
- Status, metrics, maintenance behavior, silences, and alert transitions match
  the Job adapter for the same fixtures.
- `bun run check`, scheduler fake-clock tests, sidecar protocol tests, cluster
  end-to-end tests, and `bun run validate:generated` pass.

## Non-goals

- active/active controllers;
- a durable external queue or per-run CRD;
- replaying every missed interval;
- horizontally scaling checker Pods before one Pod's measured capacity is
  insufficient;
- automatic fallback from the sidecar to Jobs;
- changing the Monitor scheduling spec in this migration.
