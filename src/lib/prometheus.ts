/**
 * Prometheus Metrics Export
 *
 * Yuptime exports all monitoring metrics to Prometheus for:
 * - Time-series data storage
 * - Grafana dashboard visualization
 * - Long-term retention and analysis
 */

import { Counter, collectDefaultMetrics, Gauge, Registry } from "prom-client";

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
  labelNames: ["monitor", "namespace", "type", "url"] as const,
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
export const monitorStateChanges = new Gauge({
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
export const checkDuration = new Gauge({
  name: "yuptime_monitor_check_duration_seconds",
  help: "Time taken to run monitor check",
  labelNames: ["monitor", "namespace", "type"] as const,
  registers: [registry],
});

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
 * Called by job completion watcher after each check
 */
export function recordCheckResult(
  monitorName: string,
  namespace: string,
  type: string,
  url: string,
  result: {
    state: "up" | "down" | "pending" | "flapping" | "paused";
    latencyMs?: number;
    durationMs?: number;
  },
): void {
  // Record state (0 = down, 1 = up, 0.5 = pending)
  const stateValue = result.state === "up" ? 1 : result.state === "down" ? 0 : 0.5;
  monitorState.set({ monitor: monitorName, namespace, type, url }, stateValue);

  // Record latency if available
  if (result.latencyMs !== undefined) {
    monitorLatency.set({ monitor: monitorName, namespace, type }, result.latencyMs);
  }

  // Record check duration if available
  if (result.durationMs !== undefined) {
    checkDuration.set(
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
 * Reset metrics for a specific monitor
 * Useful when a monitor is deleted
 */
export function resetMonitorMetrics(monitorName: string, namespace: string): void {
  // Remove all metrics for this monitor
  monitorState.remove({ monitor: monitorName, namespace });
  monitorLatency.remove({ monitor: monitorName, namespace });
  checkDuration.remove({ monitor: monitorName, namespace });
  // Note: We don't reset counters as they are cumulative
}
