# Checker execution redesign

## Decision

Replace the default one-Job-per-check executor with a persistent, bounded
checker worker pool. Keep Kubernetes Job execution as an explicit compatibility
mode for checks that genuinely require process or Pod isolation.

This is an execution-engine change, not a CRD product change. `Monitor`,
`MonitorSet`, maintenance, silence, status, and Prometheus contracts should
remain stable during the migration.

## Why the current model must change

The current Job executor has six concrete operational problems:

1. **Control-plane churn.** Every scheduled check creates a Job, Pod, events,
   status writes, watches, and garbage-collection work. Six one-minute monitors
   create about 360 Jobs per hour before retries.
2. **Cleanup is not containment.** `ttlSecondsAfterFinished` limits completed
   Job retention but does not prevent creation churn, and terminated Pods can
   remain when cluster-level Pod garbage collection has a high threshold.
3. **Telemetry amplification.** Each short-lived Pod is discovered by
   kube-state-metrics, kubelet/cAdvisor, log collection, events, and Kubernetes
   audit telemetry. Relabel drops reduce stored series but do not remove the
   upstream API and collector work.
4. **No global backpressure.** Independent Jobs do not provide one authoritative
   concurrency budget. A delayed scheduler, API recovery, or large MonitorSet
   can create a burst that competes with application rollouts and CI workloads.
5. **Transient failures are expensive and noisy.** A DNS or egress timeout
   consumes a complete Pod lifecycle. Retry and error-budget behavior is harder
   to reason about when execution state is split between Job status, Pod status,
   checker logs, and Monitor status.
6. **Capacity scales with check frequency, not useful work.** The Kubernetes API,
   scheduler, container runtime, image cache, and log tailers pay fixed overhead
   for checks that usually perform one short network request. That overhead
   becomes the limiting resource before checker CPU or memory does.

## Target architecture

```text
Monitor informer
      |
      v
deterministic scheduler -- coalesce by monitor ID --> bounded queue
                                                     |
                                                     v
                                           persistent worker pool
                                             |   |   |   |
                                             +---+---+---+
                                                     |
                                                     v
                                         result/status publisher
                                                     |
                                                     v
                                      Monitor status + Prometheus
```

Run the scheduler and pool in the existing single active Yuptime controller
process initially. The checkers are already TypeScript modules used by the
checker executor, so the pooled runner should call the same implementations
through a new execution interface rather than duplicating check logic.

The pool must have these properties:

- a configurable global concurrency limit with a conservative default;
- at most one queued or running check per monitor;
- deterministic jitter preserved from the current scheduler;
- missed intervals coalesced into one run instead of replayed as a burst;
- an `AbortSignal` deadline for every attempt and a hard outer deadline;
- bounded, policy-driven retries inside the same worker execution;
- graceful shutdown that stops admission, drains briefly, then aborts;
- status writes performed by the controller, not by independent checker Pods;
- Job mode retained behind an explicit per-install or per-monitor override.

An external queue, database, or per-check `CheckRun` CRD is intentionally not
part of the first design. Yuptime already assumes one active controller, and a
missed in-memory schedule is safely recovered at the next interval. Creating a
new CR for every run would simply move the API churn to another resource type.

## Execution interface

Introduce a small boundary before changing scheduling:

```ts
interface CheckRunner {
  run(monitor: Monitor, signal: AbortSignal): Promise<CheckResult>;
  cancel(monitorId: string): Promise<void>;
  shutdown(): Promise<void>;
}
```

Implementations:

- `PooledCheckRunner`: default, calls checker modules in the persistent process.
- `KubernetesJobCheckRunner`: compatibility and isolation fallback using the
  existing Job builder and completion watcher.

The reconciler and deterministic scheduler should depend on `CheckRunner`, not
on Job names or Batch API status. This keeps the CRD and scheduling behavior
testable independently from the execution backend.

## Required observability

Add metrics before making pooled mode the default:

- `yuptime_check_queue_depth`;
- `yuptime_checks_in_flight`;
- `yuptime_check_queue_wait_seconds`;
- `yuptime_checks_total{type,result,reason}`;
- `yuptime_check_duration_seconds{type}`;
- `yuptime_check_retries_total{type,reason}`;
- `yuptime_check_coalesced_total{reason}`;
- `yuptime_worker_saturation_ratio`;
- scheduler last-success timestamp and overdue-monitor count.

Do not label metrics with arbitrary URLs, Pod names, error strings, or other
unbounded values. Monitor-level state remains available through the existing
status and deliberately bounded monitor metrics.

## Failure semantics

- Queue saturation delays checks; it must not create more workers or Jobs.
- If the same monitor becomes due while queued or running, record a coalesced
  execution and schedule from the next deterministic interval.
- A timed-out attempt is aborted and classified consistently across checker
  types.
- Status publication is monotonic per monitor execution so a late result cannot
  overwrite a newer result.
- A worker panic or rejected promise must fail only that execution and be
  converted to a structured reason.
- Readiness fails when the scheduler is not running or queue progress is stale;
  target failures do not fail Yuptime readiness.

## Delivery plan

1. Extract the `CheckRunner` interface around the current Job implementation
   with no behavior change.
2. Move status publication into a shared result publisher and add monotonic
   execution IDs.
3. Implement the bounded queue and pooled runner with fake-clock,
   cancellation, saturation, coalescing, and shutdown tests.
4. Add `executionMode: jobs | pooled` packaging configuration, defaulting to
   `jobs` for the first release and preserving a deploy-time emergency
   override.
5. Canary pooled mode with the same monitors while comparing results, latency,
   queue metrics, and alert behavior; never run both modes as status writers for
   one monitor.
6. Make pooled mode the default, remove checker-Job RBAC from that mode, and
   retain Job mode until at least one stable release proves rollback.

## Acceptance criteria

- A one-hour run with six one-minute monitors creates zero checker Jobs in
  pooled mode.
- Check results, latency objectives, maintenance, silences, and alerts match the
  Job executor for the same deterministic fixtures.
- The pool never exceeds configured concurrency, including after controller or
  API recovery.
- Queue delay and overdue monitors are visible and alertable before checks are
  silently skipped.
- Controller restart recovers scheduling without replaying every missed run.
- Job mode remains selectable through one documented configuration override and
  passes the existing Job execution tests.
- Generated Timoni, Helm, and static manifests remain synchronized for every
  new configuration field.

## Non-goals

- multi-controller active/active scheduling;
- durable per-check history in a database;
- replaying every interval missed during downtime;
- removing Job execution before the pooled path has a proven rollback window;
- weakening timeouts, NetworkPolicy, or checker validation to gain throughput.
