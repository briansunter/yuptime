/**
 * Checker Executor
 * Executes monitor checks in Job pods
 * Updates Monitor CRD status directly via Kubernetes API
 */

import { existsSync, readFileSync } from "node:fs";
import { KubeConfig } from "@kubernetes/client-node";
import type { CheckResult } from "../checkers";
import { executeCheck as runCheck } from "../checkers";
import type { Monitor } from "../types/crd";

const logger = console;

// Accept self-signed certificates for local development
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Read service account token for in-cluster auth
let saToken: string | null = null;
let apiServerUrl: string | null = null;

const tokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token";
if (existsSync(tokenPath)) {
  try {
    saToken = readFileSync(tokenPath, "utf-8").trim();
    apiServerUrl = `https://${process.env.KUBERNETES_SERVICE_HOST}:${process.env.KUBERNETES_SERVICE_PORT}`;
    logger.info(`Loaded in-cluster config, API server: ${apiServerUrl}`);
  } catch (e) {
    logger.warn("Failed to read service account token:", e);
  }
} else {
  logger.info("Not running in-cluster, using kubeconfig");
}

// Initialize kubeConfig for fallback
const kubeConfig = new KubeConfig();
if (!saToken) {
  kubeConfig.loadFromDefault();
}

/**
 * Make an authenticated request to the Kubernetes API
 */
async function k8sRequest(
  method: string,
  path: string,
  body?: unknown,
  contentType?: string,
): Promise<Response> {
  // Build URL and headers based on whether we're in-cluster
  let url: string;
  const headers: Record<string, string> = {
    "Content-Type": contentType || "application/json",
    Accept: "application/json",
  };

  if (saToken && apiServerUrl) {
    // In-cluster: use service account token
    url = `${apiServerUrl}${path}`;
    headers.Authorization = `Bearer ${saToken}`;
  } else {
    // Out of cluster: use kubeconfig
    const cluster = kubeConfig.getCurrentCluster();
    if (!cluster) {
      throw new Error("No current cluster configured");
    }
    url = `${cluster.server}${path}`;

    // Get auth from kubeconfig
    const authOpts = await kubeConfig.applyToFetchOptions({
      method,
      headers,
    });
    Object.assign(
      headers,
      Object.fromEntries(Object.entries(authOpts.headers || {})),
    );
  }

  logger.debug(
    `Making ${method} request to ${path}, auth present: ${!!headers.Authorization}`,
  );

  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Load a Monitor CRD from Kubernetes API
 */
export async function loadMonitorCRD(
  namespace: string,
  name: string,
): Promise<Monitor> {
  const path = `/apis/monitoring.yuptime.io/v1/namespaces/${namespace}/monitors/${name}`;

  try {
    const response = await k8sRequest("GET", path);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get monitor: ${response.status} ${text}`);
    }

    return (await response.json()) as Monitor;
  } catch (error) {
    logger.error(`Failed to load Monitor CRD ${namespace}/${name}:`, error);
    throw error;
  }
}

/**
 * Execute a monitor check
 */
export async function executeCheck(
  namespace: string,
  name: string,
): Promise<CheckResult> {
  try {
    // Load Monitor CRD
    const monitor = await loadMonitorCRD(namespace, name);

    // Get timeout from monitor spec
    const timeout = monitor.spec.schedule?.timeoutSeconds || 30;

    logger.info(`Executing check for ${namespace}/${name}`);

    // Execute the check
    const result = await runCheck(monitor as any, timeout);

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
    // Use merge patch format - simple object merge
    const statusPatch = {
      status: {
        lastResult: {
          state: result.state,
          latencyMs: result.latencyMs,
          reason: result.reason || null,
          message: result.message || null,
          checkedAt: new Date().toISOString(),
          attempts: 1,
        },
      },
    };

    const response = await k8sRequest(
      "PATCH",
      path,
      statusPatch,
      "application/merge-patch+json",
    );

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
