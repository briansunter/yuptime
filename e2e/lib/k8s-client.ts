/**
 * Kubernetes Client Utilities for E2E Tests
 */

import * as k8s from "@kubernetes/client-node";
import {
  DEFAULT_TIMEOUT_MS,
  E2E_NAMESPACE,
  JOB_WAIT_TIMEOUT_MS,
  STATUS_POLL_INTERVAL_MS,
} from "./config";

// Initialize Kubernetes client
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
const batchApi = kc.makeApiClient(k8s.BatchV1Api);
const _coreApi = kc.makeApiClient(k8s.CoreV1Api);

// CRD configuration
const CRD_GROUP = "monitoring.yuptime.io";
const CRD_VERSION = "v1";

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
    alerting?: {
      alertmanagerUrl?: string;
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
    checkedAt: string;
  };
  uptime?: {
    percent1h: number;
    percent24h: number;
    percent7d: number;
    percent30d: number;
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
    startTime: string;
    endTime: string;
    selector?: {
      matchNamespaces?: string[];
      matchLabels?: { matchLabels?: Record<string, string> };
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
    selector?: {
      matchNamespaces?: string[];
      matchNames?: Array<{ namespace: string; name: string }>;
      matchLabels?: { matchLabels?: Record<string, string> };
    };
  };
}

/**
 * Create a Monitor CRD
 */
export async function createMonitor(monitor: Monitor): Promise<Monitor> {
  const namespace = monitor.metadata.namespace || E2E_NAMESPACE;

  const result = await customApi.createNamespacedCustomObject(
    CRD_GROUP,
    CRD_VERSION,
    namespace,
    "monitors",
    monitor,
  );

  return result.body as Monitor;
}

/**
 * Get a Monitor CRD
 */
export async function getMonitor(
  name: string,
  namespace: string = E2E_NAMESPACE,
): Promise<Monitor> {
  const result = await customApi.getNamespacedCustomObject(
    CRD_GROUP,
    CRD_VERSION,
    namespace,
    "monitors",
    name,
  );

  return result.body as Monitor;
}

/**
 * Delete a Monitor CRD
 */
export async function deleteMonitor(
  name: string,
  namespace: string = E2E_NAMESPACE,
): Promise<void> {
  try {
    await customApi.deleteNamespacedCustomObject(
      CRD_GROUP,
      CRD_VERSION,
      namespace,
      "monitors",
      name,
    );
  } catch (error) {
    // Ignore 404 errors
    if ((error as { response?: { statusCode: number } }).response?.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Create a MaintenanceWindow CRD
 */
export async function createMaintenanceWindow(mw: MaintenanceWindow): Promise<MaintenanceWindow> {
  const namespace = mw.metadata.namespace || E2E_NAMESPACE;

  const result = await customApi.createNamespacedCustomObject(
    CRD_GROUP,
    CRD_VERSION,
    namespace,
    "maintenancewindows",
    mw,
  );

  return result.body as MaintenanceWindow;
}

/**
 * Delete a MaintenanceWindow CRD
 */
export async function deleteMaintenanceWindow(
  name: string,
  namespace: string = E2E_NAMESPACE,
): Promise<void> {
  try {
    await customApi.deleteNamespacedCustomObject(
      CRD_GROUP,
      CRD_VERSION,
      namespace,
      "maintenancewindows",
      name,
    );
  } catch (error) {
    if ((error as { response?: { statusCode: number } }).response?.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Create a Silence CRD
 */
export async function createSilence(silence: Silence): Promise<Silence> {
  const namespace = silence.metadata.namespace || E2E_NAMESPACE;

  const result = await customApi.createNamespacedCustomObject(
    CRD_GROUP,
    CRD_VERSION,
    namespace,
    "silences",
    silence,
  );

  return result.body as Silence;
}

/**
 * Delete a Silence CRD
 */
export async function deleteSilence(
  name: string,
  namespace: string = E2E_NAMESPACE,
): Promise<void> {
  try {
    await customApi.deleteNamespacedCustomObject(
      CRD_GROUP,
      CRD_VERSION,
      namespace,
      "silences",
      name,
    );
  } catch (error) {
    if ((error as { response?: { statusCode: number } }).response?.statusCode !== 404) {
      throw error;
    }
  }
}

/**
 * Wait for a checker job to complete for a monitor
 */
export async function waitForJobCompletion(
  monitorName: string,
  namespace: string = E2E_NAMESPACE,
  timeoutMs: number = JOB_WAIT_TIMEOUT_MS,
): Promise<void> {
  const startTime = Date.now();
  const labelSelector = `monitoring.yuptime.io/monitor=${namespace}-${monitorName}`;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const jobs = await batchApi.listNamespacedJob(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        labelSelector,
      );

      // Check if any job has completed
      const completedJob = jobs.body.items.find(
        (job) => job.status?.succeeded && job.status.succeeded > 0,
      );

      if (completedJob) {
        return;
      }
    } catch {
      // Ignore errors and retry
    }

    await sleep(STATUS_POLL_INTERVAL_MS);
  }

  throw new Error(`Timeout waiting for job completion for monitor ${monitorName}`);
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
    const result = await customApi.listNamespacedCustomObject(
      CRD_GROUP,
      CRD_VERSION,
      namespace,
      "monitors",
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector,
    );

    const monitors = (result.body as { items: Monitor[] }).items;

    for (const monitor of monitors) {
      await deleteMonitor(monitor.metadata.name, namespace);
    }
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
    // Fallback to localhost (for port-forward scenarios)
    const response = await fetch("http://localhost:3000/metrics");
    return await response.text();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
