/**
 * Kubernetes Client Utilities for E2E Tests
 * Uses kubectl commands for Bun compatibility
 */

import { $ } from "bun";
import {
  DEFAULT_TIMEOUT_MS,
  E2E_NAMESPACE,
  STATUS_POLL_INTERVAL_MS,
} from "./config";

// Helper to run kubectl commands
async function kubectl(args: string[]): Promise<string> {
  const result = await $`kubectl ${args}`.quiet();
  return result.text();
}

async function kubectlJson<T>(args: string[]): Promise<T> {
  const result = await kubectl([...args, "-o", "json"]);
  return JSON.parse(result);
}

export interface Monitor {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
  };
  spec: {
    enabled: boolean;
    type: string;
    schedule: {
      intervalSeconds: number;
      timeoutSeconds: number;
    };
    target: Record<string, unknown>;
    successCriteria?: Record<string, unknown>;
    alertmanagerUrl?: string;
    alerting?: {
      notifyOn?: {
        down?: boolean;
        up?: boolean;
        flapping?: boolean;
        certExpiring?: boolean;
      };
    };
  };
  status?: MonitorStatus;
}

export interface MonitorStatus {
  lastResult?: {
    state: "up" | "down";
    reason: string;
    message: string;
    latencyMs: number;
    executionId: string;
    scheduledAt: string;
    startedAt: string;
    checkedAt: string;
  };
  uptime?: {
    last1h?: number;
    last24h?: number;
    last7d?: number;
    last30d?: number;
  };
}

export interface MaintenanceWindow {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    enabled?: boolean;
    schedule: {
      start: string;
      end: string;
      recurrence?: {
        rrule?: string;
      };
    };
    match?: {
      matchNamespaces?: string[];
      matchLabels?: {
        matchLabels?: Record<string, string>;
      };
    };
    behavior?: {
      suppressNotifications?: boolean;
    };
  };
}

export interface Silence {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    expiresAt: string;
    reason?: string;
    match: {
      namespaces?: string[];
      labels?: Record<string, string>;
    };
  };
}

/**
 * Create a Monitor CRD
 */
export async function createMonitor(monitor: Monitor): Promise<Monitor> {
  const namespace = monitor.metadata.namespace || E2E_NAMESPACE;
  monitor.metadata.namespace = namespace;

  // Write monitor to temp file and apply
  const tempFile = `/tmp/monitor-${Date.now()}.json`;
  await Bun.write(tempFile, JSON.stringify(monitor));

  try {
    await kubectl(["apply", "-f", tempFile, "-n", namespace]);
    return await getMonitor(monitor.metadata.name, namespace);
  } finally {
    // Clean up temp file
    try {
      await $`rm ${tempFile}`.quiet();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Get a Monitor CRD
 */
export async function getMonitor(
  name: string,
  namespace: string = E2E_NAMESPACE,
): Promise<Monitor> {
  return await kubectlJson<Monitor>(["get", "monitor", name, "-n", namespace]);
}

/**
 * Delete a Monitor CRD
 */
export async function deleteMonitor(
  name: string,
  namespace: string = E2E_NAMESPACE,
): Promise<void> {
  try {
    await kubectl(["delete", "monitor", name, "-n", namespace, "--ignore-not-found"]);
  } catch {
    // Ignore errors
  }
}

/**
 * Create a MaintenanceWindow CRD
 */
export async function createMaintenanceWindow(mw: MaintenanceWindow): Promise<MaintenanceWindow> {
  const namespace = mw.metadata.namespace || E2E_NAMESPACE;
  mw.metadata.namespace = namespace;

  const tempFile = `/tmp/mw-${Date.now()}.json`;
  await Bun.write(tempFile, JSON.stringify(mw));

  try {
    await kubectl(["apply", "-f", tempFile, "-n", namespace]);
    return await kubectlJson<MaintenanceWindow>(["get", "maintenancewindow", mw.metadata.name, "-n", namespace]);
  } finally {
    try {
      await $`rm ${tempFile}`.quiet();
    } catch {
      // Ignore
    }
  }
}

/**
 * Delete a MaintenanceWindow CRD
 */
export async function deleteMaintenanceWindow(
  name: string,
  namespace: string = E2E_NAMESPACE,
): Promise<void> {
  try {
    await kubectl(["delete", "maintenancewindow", name, "-n", namespace, "--ignore-not-found"]);
  } catch {
    // Ignore errors
  }
}

/**
 * Create a Silence CRD
 */
export async function createSilence(silence: Silence): Promise<Silence> {
  const namespace = silence.metadata.namespace || E2E_NAMESPACE;
  silence.metadata.namespace = namespace;

  const tempFile = `/tmp/silence-${Date.now()}.json`;
  await Bun.write(tempFile, JSON.stringify(silence));

  try {
    await kubectl(["apply", "-f", tempFile, "-n", namespace]);
    return await kubectlJson<Silence>(["get", "silence", silence.metadata.name, "-n", namespace]);
  } finally {
    try {
      await $`rm ${tempFile}`.quiet();
    } catch {
      // Ignore
    }
  }
}

/**
 * Delete a Silence CRD
 */
export async function deleteSilence(
  name: string,
  namespace: string = E2E_NAMESPACE,
): Promise<void> {
  try {
    await kubectl(["delete", "silence", name, "-n", namespace, "--ignore-not-found"]);
  } catch {
    // Ignore errors
  }
}

/**
 * Count checker Jobs created for a monitor.
 */
export async function getCheckerJobCount(
  monitorName: string,
  namespace: string = E2E_NAMESPACE,
): Promise<number> {
  const labelSelector = `monitoring.yuptime.io/monitor=${namespace}-${monitorName}`;
  const jobs = await kubectlJson<{ items: unknown[] }>([
    "get",
    "jobs",
    "-n",
    namespace,
    "-l",
    labelSelector,
  ]);
  return jobs.items.length;
}

/**
 * Wait for monitor status to have a result
 */
export async function waitForMonitorStatus(
  monitorName: string,
  namespace: string = E2E_NAMESPACE,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<MonitorStatus> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const monitor = await getMonitor(monitorName, namespace);

      if (monitor.status?.lastResult) {
        return monitor.status;
      }
    } catch {
      // Ignore errors and retry
    }

    await sleep(STATUS_POLL_INTERVAL_MS);
  }

  throw new Error(`Timeout waiting for status update on monitor ${monitorName}`);
}

/**
 * Wait for monitor to have a specific state
 */
export async function waitForMonitorState(
  monitorName: string,
  expectedState: "up" | "down",
  namespace: string = E2E_NAMESPACE,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<MonitorStatus> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const monitor = await getMonitor(monitorName, namespace);

      if (monitor.status?.lastResult?.state === expectedState) {
        return monitor.status;
      }
    } catch {
      // Ignore errors and retry
    }

    await sleep(STATUS_POLL_INTERVAL_MS);
  }

  throw new Error(`Timeout waiting for monitor ${monitorName} to reach state ${expectedState}`);
}

/**
 * Delete all monitors with a specific label
 */
export async function deleteMonitorsByLabel(
  labelSelector: string,
  namespace: string = E2E_NAMESPACE,
): Promise<void> {
  try {
    await kubectl(["delete", "monitors", "-n", namespace, "-l", labelSelector, "--ignore-not-found"]);
  } catch {
    // Ignore errors
  }
}

/**
 * Get metrics from the Yuptime API
 */
export async function getMetrics(namespace: string = E2E_NAMESPACE): Promise<string> {
  // Port-forward or use service URL
  const serviceUrl = `http://yuptime-api.${namespace}.svc.cluster.local:3000/metrics`;

  try {
    const response = await fetch(serviceUrl);
    return await response.text();
  } catch {
    // Fallback to IPv4 loopback for kubectl port-forward scenarios.
    // On some hosts, localhost resolves to an unrelated IPv6 listener.
    const response = await fetch("http://127.0.0.1:3000/metrics");
    return await response.text();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
