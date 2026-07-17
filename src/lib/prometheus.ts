/**
 * Prometheus Metrics Export
 *
 * Yuptime exports all monitoring metrics to Prometheus for:
 * - Time-series data storage
 * - Grafana dashboard visualization
 * - Long-term retention and analysis
 */

import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from "prom-client";

// Create registry for yuptime metrics
const registry = new Registry();

// Collect default Node.js metrics (CPU, memory, etc.)
collectDefaultMetrics({ register: registry });

/**
 * Monitor state (0 = down, 1 = up)
 * Gauge showing current state of each monitor
 */
export const monitorState = new Gauge({
  name: "yuptime_monitor_state",
  help: "Current state of monitor (0=down, 1=up)",
  labelNames: ["monitor", "namespace", "type"] as const,
  registers: [registry],
});

/**
 * Monitor latency in milliseconds
 * Gauge showing response time for last check
 */
export const monitorLatency = new Gauge({
  name: "yuptime_monitor_latency_ms",
  help: "Monitor check latency in milliseconds",
  labelNames: ["monitor", "namespace", "type"] as const,
  registers: [registry],
});

/**
 * Total number of monitor checks
 * Counter tracking total check count
 */
export const monitorChecksTotal = new Counter({
  name: "yuptime_monitor_checks_total",
  help: "Total number of monitor checks performed",
  labelNames: ["monitor", "namespace", "type", "result"] as const,
  registers: [registry],
});

/**
 * Monitor state changes
 * Counter tracking when monitors go up/down
 */
export const monitorStateChanges = new Counter({
  name: "yuptime_monitor_state_changes_total",
  help: "Number of monitor state changes (up to down, down to up)",
  labelNames: ["monitor", "namespace", "from_state", "to_state"] as const,
  registers: [registry],
});

/**
 * Active incidents
 * Gauge showing number of currently active incidents
 */
export const activeIncidents = new Gauge({
  name: "yuptime_active_incidents",
  help: "Number of active incidents",
  labelNames: ["monitor", "namespace", "severity"] as const,
  registers: [registry],
});

/**
 * Monitor check duration
 * Histogram showing time taken to run checks
 */
export const checkDuration = new Histogram({
  name: "yuptime_monitor_check_duration_seconds",
  help: "Time taken to run monitor check",
  labelNames: ["monitor", "namespace", "type"] as const,
  registers: [registry],
});

/**
 * Alert delivery failures
 * Counter incremented whenever an Alertmanager delivery fails (invalid URL,
 * timeout, network error, or non-2xx response). Makes alert loss observable.
 */
export const alertDeliveryFailedTotal = new Counter({
  name: "yuptime_alert_delivery_failed_total",
  help: "Total number of Alertmanager alert deliveries that failed",
  labelNames: ["monitor", "namespace", "reason"] as const,
  registers: [registry],
});

export const schedulerLastTick = new Gauge({
  name: "yuptime_scheduler_last_tick_timestamp_seconds",
  help: "Wall-clock timestamp of the most recent Check Engine scheduler tick",
  registers: [registry],
});

export const schedulerOverdueMonitors = new Gauge({
  name: "yuptime_scheduler_overdue_monitors",
  help: "Number of monitors with a due slot not yet admitted",
  registers: [registry],
});

export const checkQueueDepth = new Gauge({
  name: "yuptime_check_queue_depth",
  help: "Number of admitted checks waiting for a runner",
  registers: [registry],
});

export const checksInFlight = new Gauge({
  name: "yuptime_checks_in_flight",
  help: "Number of checks currently executing",
  registers: [registry],
});

export const checkQueueWait = new Histogram({
  name: "yuptime_check_queue_wait_seconds",
  help: "Time from admission until checker execution starts",
  labelNames: ["type"] as const,
  registers: [registry],
});

export const checkStartDelay = new Histogram({
  name: "yuptime_check_start_delay_seconds",
  help: "Time from immutable schedule slot until checker execution starts",
  labelNames: ["type"] as const,
  registers: [registry],
});

export const checksTotal = new Counter({
  name: "yuptime_checks_total",
  help: "Total persistent Check Engine attempts",
  labelNames: ["type", "result", "reason"] as const,
  registers: [registry],
});

export const checkerDuration = new Histogram({
  name: "yuptime_check_duration_seconds",
  help: "Duration of persistent checker attempts",
  labelNames: ["type"] as const,
  registers: [registry],
});

export const checkRetries = new Counter({
  name: "yuptime_check_retries_total",
  help: "Total checker retries",
  labelNames: ["type", "reason"] as const,
  registers: [registry],
});

export const checkCoalesced = new Counter({
  name: "yuptime_check_coalesced_total",
  help: "Total schedule slots coalesced into a newer pending slot",
  labelNames: ["reason"] as const,
  registers: [registry],
});

export const checkerWorkerRestarts = new Counter({
  name: "yuptime_checker_worker_restarts_total",
  help: "Total checker worker process replacements",
  labelNames: ["reason"] as const,
  registers: [registry],
});

export const checkerWorkers = new Gauge({
  name: "yuptime_checker_workers",
  help: "Checker worker processes by state",
  labelNames: ["state"] as const,
  registers: [registry],
});

/**
 * Label values observed per monitor, so resetMonitorMetrics() can remove
 * complete label sets across all metric types without guessing cardinality.
 */
const monitorLabelValues = new Map<string, { type: string }>();
const monitorIncidentSeverities = new Map<string, Set<"critical" | "warning" | "info">>();

/**
 * Get metrics endpoint for Prometheus scraping
 * @returns Prometheus metrics in text format
 */
export async function getMetrics(): Promise<string> {
  return await registry.metrics();
}

/**
 * Get the Prometheus registry
 * Useful for registering custom metrics
 */
export function getRegistry(): Registry {
  return registry;
}

/**
 * Record a check result in Prometheus metrics
 * Called by the ordered result publisher after a status commit wins.
 */
export function recordCheckResult(
  monitorName: string,
  namespace: string,
  type: string,
  result: {
    state: "up" | "down" | "pending" | "flapping" | "paused";
    latencyMs?: number;
    durationMs?: number;
  },
): void {
  const monitorKey = `${namespace}/${monitorName}`;
  monitorLabelValues.set(monitorKey, { type });

  // Record state (0 = down, 1 = up, 0.5 = pending)
  let stateValue = 0.5;
  if (result.state === "up") {
    stateValue = 1;
  } else if (result.state === "down") {
    stateValue = 0;
  }
  monitorState.set({ monitor: monitorName, namespace, type }, stateValue);

  // Record latency if available
  if (result.latencyMs !== undefined) {
    monitorLatency.set({ monitor: monitorName, namespace, type }, result.latencyMs);
  }

  // Record check duration if available
  if (result.durationMs !== undefined) {
    checkDuration.observe(
      { monitor: monitorName, namespace, type },
      result.durationMs / 1000, // Convert to seconds
    );
  }

  // Increment total checks counter
  monitorChecksTotal.inc({ monitor: monitorName, namespace, type, result: result.state }, 1);
}

/**
 * Record a state change (up → down or down → up)
 */
export function recordStateChange(
  monitorName: string,
  namespace: string,
  fromState: string,
  toState: string,
): void {
  monitorStateChanges.inc(
    {
      monitor: monitorName,
      namespace,
      from_state: fromState,
      to_state: toState,
    },
    1,
  );
}

/**
 * Increment active incidents counter
 */
export function incrementActiveIncidents(
  monitorName: string,
  namespace: string,
  severity: "critical" | "warning" | "info",
): void {
  const monitorKey = `${namespace}/${monitorName}`;
  const severities = monitorIncidentSeverities.get(monitorKey) ?? new Set();
  severities.add(severity);
  monitorIncidentSeverities.set(monitorKey, severities);

  activeIncidents.inc({ monitor: monitorName, namespace, severity }, 1);
}

/**
 * Decrement active incidents counter
 */
export function decrementActiveIncidents(
  monitorName: string,
  namespace: string,
  severity: "critical" | "warning" | "info",
): void {
  activeIncidents.dec({ monitor: monitorName, namespace, severity }, 1);
}

/**
 * Reset metrics for a specific monitor.
 * Removes gauge/histogram series so deleted monitors do not leak.
 *
 * Cumulative counters (monitor_checks_total, monitor_state_changes_total)
 * are intentionally retained: counters represent total event counts and
 * Prometheus handles staleness via staleness markers after the series stops
 * being scraped. Removing a counter mid-life would break `increase()`/`rate()`
 * computations. This is the documented retention policy.
 */
export function resetMonitorMetrics(monitorName: string, namespace: string): void {
  const monitorKey = `${namespace}/${monitorName}`;
  const labels = monitorLabelValues.get(monitorKey);
  const type = labels?.type ?? "";

  // Remove gauge/histogram series with the full label set
  monitorState.remove({ monitor: monitorName, namespace, type });
  monitorLatency.remove({ monitor: monitorName, namespace, type });
  checkDuration.remove({ monitor: monitorName, namespace, type });

  for (const severity of monitorIncidentSeverities.get(monitorKey) ?? []) {
    activeIncidents.remove({ monitor: monitorName, namespace, severity });
  }

  monitorLabelValues.delete(monitorKey);
  monitorIncidentSeverities.delete(monitorKey);
}
