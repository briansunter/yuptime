import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import {
  AppsV1Api,
  BatchV1Api,
  CoordinationV1Api,
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
} from "@kubernetes/client-node";
import { logger } from "../lib/logger";
import { isRecoverableAsyncError } from "../lib/recoverable-error";

let kubeConfig: KubeConfig;

/**
 * Initialize Kubernetes client from environment
 * Supports both in-cluster and kubeconfig file
 */
export function initializeK8sClient(): KubeConfig {
  if (kubeConfig) return kubeConfig;

  kubeConfig = new KubeConfig();

  try {
    // Try to load from in-cluster config first
    kubeConfig.loadFromCluster();
    logger.info("Kubernetes client: using in-cluster configuration");
  } catch (_error) {
    // Fall back to kubeconfig file
    try {
      kubeConfig.loadFromDefault();
      logger.info("Kubernetes client: using kubeconfig file");
    } catch (_error) {
      logger.error("Failed to initialize Kubernetes client");
      throw new Error(
        "Kubernetes client initialization failed. Ensure running in cluster or KUBECONFIG is set.",
      );
    }
  }

  // Accept self-signed certificates (for local development clusters like OrbStack, minikube)
  // Note: skipTLSVerify is read-only in newer versions, must be set via environment
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  logger.info("Kubernetes client: accepting self-signed certificates");

  return kubeConfig;
}

export function getK8sClient(): KubeConfig {
  if (!kubeConfig) {
    throw new Error("Kubernetes client not initialized");
  }
  return kubeConfig;
}

function toNodeReadableStream(body: unknown): NodeJS.ReadableStream {
  if (
    typeof body === "object" &&
    body !== null &&
    "on" in body &&
    typeof (body as { on: unknown }).on === "function"
  ) {
    return body as NodeJS.ReadableStream;
  }

  if (body instanceof ReadableStream) {
    return Readable.fromWeb(body) as NodeJS.ReadableStream;
  }

  if (typeof body === "object" && body !== null && Symbol.asyncIterator in body) {
    return Readable.from(body as AsyncIterable<string | Uint8Array>);
  }

  throw new Error("Watch response body is not a readable stream");
}

type WatchQueryValue = string | number | boolean | undefined;

export interface WatchHandle {
  abort: () => void;
}

/**
 * Start a Kubernetes watch using Bun-compatible fetch/stream handling.
 * This absorbs expected aborts during proactive watch rotation instead of
 * surfacing them as unhandled global async errors.
 */
export async function startK8sWatch<T>(
  path: string,
  queryParams: Record<string, WatchQueryValue>,
  onEvent: (type: string, obj: T) => void,
  onDone: (error?: unknown) => void,
): Promise<WatchHandle> {
  const kc = getK8sClient();
  const cluster = kc.getCurrentCluster();
  if (!cluster) {
    throw new Error("No current cluster configured");
  }

  const url = new URL(cluster.server + path);
  url.searchParams.set("watch", "true");
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const requestInit: Record<string, unknown> = {};
  await kc.applyToFetchOptions(requestInit);

  const controller = new AbortController();
  let doneCalled = false;
  const doneOnce = (error?: unknown) => {
    if (doneCalled) {
      return;
    }

    doneCalled = true;
    onDone(error);
  };

  const watchLoop = (async () => {
    try {
      const response = await fetch(url, {
        ...requestInit,
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...((requestInit.headers as Record<string, string> | undefined) ?? {}),
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        doneOnce();
        return;
      }

      const stream = toNodeReadableStream(response.body);
      const lines = createInterface({
        input: stream,
        crlfDelay: Number.POSITIVE_INFINITY,
      });

      try {
        for await (const line of lines) {
          if (!line) {
            continue;
          }

          try {
            const data = JSON.parse(line) as { type?: string; object?: T };
            if (data.type && data.object) {
              onEvent(data.type, data.object);
            }
          } catch {
            // Ignore malformed watch events and continue streaming.
          }
        }

        doneOnce();
      } catch (error) {
        if (controller.signal.aborted && isRecoverableAsyncError(error)) {
          doneOnce();
          return;
        }

        doneOnce(error);
      } finally {
        lines.close();
        (stream as { destroy?: () => void }).destroy?.();
      }
    } catch (error) {
      if (controller.signal.aborted && isRecoverableAsyncError(error)) {
        doneOnce();
        return;
      }

      doneOnce(error);
    }
  })();

  watchLoop.catch((error) => {
    if (controller.signal.aborted && isRecoverableAsyncError(error)) {
      doneOnce();
      return;
    }

    doneOnce(error);
  });

  return {
    abort: () => {
      controller.abort();
    },
  };
}

/**
 * Create a Custom Resource Definition watcher
 */
export function createCRDWatcher(
  group: string,
  version: string,
  plural: string,
  options: { namespace?: string; namespaced?: boolean } = {},
) {
  const kc = getK8sClient();
  const { namespace = "", namespaced: _namespaced = true } = options;

  return {
    /**
     * List all CRDs of this type
     */
    async list(): Promise<unknown[]> {
      try {
        // Construct the API path
        const path = namespace
          ? `/apis/${group}/${version}/namespaces/${namespace}/${plural}`
          : `/apis/${group}/${version}/${plural}`;

        // Make a direct request using the KubeConfig
        const opts: Record<string, unknown> = {};
        await kc.applyToHTTPSOptions(opts);

        const cluster = kc.getCurrentCluster();
        if (!cluster) {
          throw new Error("No current cluster configured");
        }

        const url = `${cluster.server}${path}`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...(opts.headers || {}),
          },
          tls: {
            rejectUnauthorized: false, // For self-signed certs in dev
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as { items?: unknown[] };
        return data.items || [];
      } catch (error) {
        logger.error({ group, version, plural, namespace, error }, "Failed to list CRDs");
        throw error;
      }
    },

    /**
     * Get a single CRD
     */
    async get(name: string, ns?: string) {
      const client = kc.makeApiClient(CustomObjectsApi);

      try {
        return ns
          ? await client.getNamespacedCustomObject({
              group,
              version,
              namespace: ns,
              plural,
              name,
            })
          : await client.getClusterCustomObject({
              group,
              version,
              plural,
              name,
            });
      } catch (error) {
        logger.error({ group, version, plural, name, namespace: ns, error }, "Failed to get CRD");
        throw error;
      }
    },

    /**
     * Create a CRD
     */
    async create(body: Record<string, unknown>, ns?: string) {
      const client = kc.makeApiClient(CustomObjectsApi);

      try {
        return ns
          ? await client.createNamespacedCustomObject({
              group,
              version,
              namespace: ns,
              plural,
              body,
            })
          : await client.createClusterCustomObject({
              group,
              version,
              plural,
              body,
            });
      } catch (error) {
        logger.error({ group, version, plural, namespace: ns, error }, "Failed to create CRD");
        throw error;
      }
    },

    /**
     * Update a CRD
     */
    async patch(name: string, body: Record<string, unknown>, ns?: string) {
      const client = kc.makeApiClient(CustomObjectsApi);

      try {
        return ns
          ? await client.patchNamespacedCustomObject({
              group,
              version,
              namespace: ns,
              plural,
              name,
              body,
            })
          : await client.patchClusterCustomObject({
              group,
              version,
              plural,
              name,
              body,
            });
      } catch (error) {
        logger.error({ group, version, plural, name, namespace: ns, error }, "Failed to patch CRD");
        throw error;
      }
    },

    /**
     * Update status subresource
     */
    async patchStatus(name: string, body: Record<string, unknown>, ns?: string) {
      const client = kc.makeApiClient(CustomObjectsApi);

      try {
        return ns
          ? await client.patchNamespacedCustomObjectStatus({
              group,
              version,
              namespace: ns,
              plural,
              name,
              body,
            })
          : await client.patchClusterCustomObjectStatus({
              group,
              version,
              plural,
              name,
              body,
            });
      } catch (error) {
        logger.error(
          { group, version, plural, name, namespace: ns, error },
          "Failed to patch CRD status",
        );
        throw error;
      }
    },

    /**
     * Delete a CRD
     */
    async delete(name: string, ns?: string) {
      const client = kc.makeApiClient(CustomObjectsApi);

      try {
        return ns
          ? await client.deleteNamespacedCustomObject({
              group,
              version,
              namespace: ns,
              plural,
              name,
            })
          : await client.deleteClusterCustomObject({
              group,
              version,
              plural,
              name,
            });
      } catch (error) {
        logger.error(
          { group, version, plural, name, namespace: ns, error },
          "Failed to delete CRD",
        );
        throw error;
      }
    },

    /**
     * Watch for changes to CRDs
     */
    watch(
      onEvent: (type: string, obj: unknown) => void,
      onError?: (error?: unknown) => void,
      ns?: string,
    ) {
      const path = ns
        ? `/apis/${group}/${version}/namespaces/${ns}/${plural}`
        : `/apis/${group}/${version}/${plural}`;

      return startK8sWatch(
        path,
        {},
        (phase, obj) => {
          onEvent(phase, obj);
        },
        onError || (() => undefined),
      );
    },
  };
}

/**
 * Get Core API client for Secrets, ConfigMaps, etc.
 */
export function getCoreApiClient() {
  const kc = getK8sClient();
  return kc.makeApiClient(CoreV1Api);
}

/**
 * Get Apps API client for Deployments, StatefulSets, etc.
 */
export function getAppsApiClient() {
  const kc = getK8sClient();
  return kc.makeApiClient(AppsV1Api);
}

/**
 * Get Coordination API client for Leases
 */
export function getCoordinationApiClient() {
  const kc = getK8sClient();
  return kc.makeApiClient(CoordinationV1Api);
}

/**
 * Get Batch API client for Jobs, CronJobs
 */
export function getBatchApiClient() {
  const kc = getK8sClient();
  return kc.makeApiClient(BatchV1Api);
}

/**
 * Get Kubernetes API clients (unified interface)
 */
export function getKubernetesClient() {
  if (!kubeConfig) {
    initializeK8sClient();
  }
  return {
    apps: getAppsApiClient(),
    core: getCoreApiClient(),
    config: kubeConfig,
  };
}
