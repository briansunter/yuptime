# Availability and scaling

Yuptime currently runs one active controller Pod. Kubernetes restarts the Pod
after failure, while Monitor specs and the latest published results remain in
the Kubernetes API.

## Failure recovery

On restart, informers rebuild the Check Engine registry from Monitor CRDs. If
multiple slots were missed, each Monitor receives at most one immediate
catch-up for the latest missed slot, then returns to its original phase.

The checker sidecar contains a fixed worker pool. A crashed or hung worker is
replaced independently without restarting the Pod. Readiness fails if the
runner is unavailable, all workers are unhealthy, the scheduler tick is stale,
or admitted work stops progressing.

## Singleton boundary

Do not run uncoordinated Yuptime replicas against the same Monitor set. The
current release assumes one status owner and does not implement active/active
monitor sharding.

A PodDisruptionBudget reduces voluntary downtime but does not make a singleton
controller active/active:

```yaml
podDisruptionBudget:
  enabled: true
  minAvailable: 1
```

If one Pod no longer has enough CPU, network capacity, or workers, first tune
resources and execution limits:

```yaml
execution:
  concurrency: 16
  queueCapacity: 512

resources:
  requests:
    cpu: 500m
    memory: 512Mi

checkerResources:
  requests:
    cpu: 500m
    memory: 512Mi
```

Use `yuptime_check_queue_wait_seconds`,
`yuptime_check_start_delay_seconds`, `yuptime_checks_in_flight`,
`yuptime_scheduler_overdue_monitors`, and `yuptime_checker_workers` to size the
pool from measured demand.

Scaling beyond one Pod requires explicit monitor sharding with exactly one
controller responsible for each Monitor. Per-check Kubernetes Jobs and
uncoordinated replicas are not horizontal-scaling mechanisms.

## Rollback mode

`execution.mode: jobs` is an installation-wide rollback adapter. It must not be
run at the same time as a sidecar-mode controller against the same Monitor set.
It exists for compatibility, not high availability.

## Monitoring Yuptime

Use Kubernetes probes for process health and scrape `/metrics` for semantic
health. A monitor can also check the service endpoint, but target availability
must not be confused with controller readiness:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: yuptime-health
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    http:
      url: http://yuptime-api.yuptime:3000/health
```
