/**
 * Checker Executor
 * Executes monitor checks in Job pods
 * Updates Monitor CRD status directly via Kubernetes API
 */

import { existsSync, readFileSync } from "node:fs";
import type { CheckResult } from "../checkers";
import { executeCheck as runCheck } from "../checkers";
import { type LastResult, type Monitor, MonitorSchema } from "../types/crd";
import { fetchK8sWithRetry } from "./k8s-request";

const logger = console;

// Read service account token for in-cluster auth (required)
const tokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token";
const caPath = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";

if (!existsSync(tokenPath)) {
  throw new Error("Not running in-cluster - checker executor requires in-cluster authentication");
}

if (!existsSync(caPath)) {
  throw new Error("In-cluster CA certificate missing - cannot verify Kubernetes API TLS");
}

const saToken = readFileSync(tokenPath, "utf-8").trim();
const caBundle = readFileSync(caPath, "utf-8");
const apiServerUrl = `https://${process.env.KUBERNETES_SERVICE_HOST}:${process.env.KUBERNETES_SERVICE_PORT}`;

logger.info(`Loaded in-cluster config, API server: ${apiServerUrl}`);

/**
 * Make an authenticated request to the Kubernetes API
 */
function k8sRequest(
  method: string,
  path: string,
  body?: unknown,
  contentType?: string,
): Promise<Response> {
  // In-cluster only: use service account token
  const url = `${apiServerUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": contentType || "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${saToken}`,
  };

  logger.debug(`Making ${method} request to ${path}, auth present: ${!!headers.Authorization}`);

  return fetchK8sWithRetry(
    url,
    {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      tls: {
        ca: caBundle,
        serverName: process.env.KUBERNETES_SERVICE_HOST,
      },
    },
    undefined,
    {
      fetch: globalThis.fetch,
      sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
      onRetry: (attempt, delayMs, reason) => {
        logger.warn(
          `Kubernetes API request ${method} ${path} failed transiently (${reason}); retry ${attempt + 1} in ${delayMs}ms`,
        );
      },
    },
  );
}

/**
 * Load a Monitor CRD from Kubernetes API
 */
export async function loadMonitorCRD(namespace: string, name: string): Promise<Monitor> {
  const path = `/apis/monitoring.yuptime.io/v1/namespaces/${namespace}/monitors/${name}`;

  try {
    const response = await k8sRequest("GET", path);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get monitor: ${response.status} ${text}`);
    }

    return MonitorSchema.parse(await response.json());
  } catch (error) {
    logger.error(`Failed to load Monitor CRD ${namespace}/${name}:`, error);
    throw error;
  }
}

/**
 * Execute a monitor check
 */
export async function executeCheck(namespace: string, name: string): Promise<CheckResult> {
  try {
    // Load Monitor CRD
    const monitor = await loadMonitorCRD(namespace, name);

    // Get timeout from monitor spec
    const timeout = monitor.spec.schedule?.timeoutSeconds || 30;

    logger.info(`Executing check for ${namespace}/${name}`);

    // Execute the check
    const result = await runCheck(monitor, timeout);

    logger.info(
      {
        monitor: `${namespace}/${name}`,
        state: result.state,
        latencyMs: result.latencyMs,
      },
      "Check completed",
    );

    return result;
  } catch (error) {
    logger.error(`Check execution failed for ${namespace}/${name}:`, error);

    return {
      state: "down",
      latencyMs: 0,
      reason: "EXECUTION_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update Monitor CRD status with check result
 * Uses Kubernetes status subresource with merge patch
 */
export async function updateMonitorStatus(
  namespace: string,
  name: string,
  result: CheckResult,
): Promise<void> {
  const monitorId = `${namespace}/${name}`;
  const path = `/apis/monitoring.yuptime.io/v1/namespaces/${namespace}/monitors/${name}/status`;

  try {
    const currentMonitor = await loadMonitorCRD(namespace, name);
    const previousResult = currentMonitor.status?.lastResult;

    // Use merge patch format - simple object merge
    const status: { lastResult: LastResult; previousResult?: LastResult } = {
      lastResult: {
        state: result.state,
        latencyMs: result.latencyMs,
        reason: result.reason || undefined,
        message: result.message || undefined,
        checkedAt: new Date().toISOString(),
        attempts: 1,
      },
    };

    if (previousResult) {
      status.previousResult = previousResult;
    }

    const statusPatch = {
      status: {
        ...status,
      },
    };

    const response = await k8sRequest("PATCH", path, statusPatch, "application/merge-patch+json");

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to patch status: ${response.status} ${text}`);
    }

    logger.info(`Updated status for ${monitorId}: ${result.state}`);
  } catch (error) {
    logger.error(`Failed to update status for ${monitorId}:`, error);
    throw error;
  }
}
