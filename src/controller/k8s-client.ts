import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import {
  AppsV1Api,
  CoordinationV1Api,
  CoreV1Api,
  KubeConfig,
  type V1Job,
} from "@kubernetes/client-node";
import { logger } from "../lib/logger";
import { isRecoverableAsyncError } from "../lib/recoverable-error";

let kubeConfig: KubeConfig;

type KubernetesJsonBody = Record<string, unknown> | Array<Record<string, unknown>>;

interface KubernetesRequestOptions {
  body?: KubernetesJsonBody;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
}

interface KubernetesList<T> {
  items: T[];
}

class KubernetesApiError extends Error {
  statusCode: number;

  constructor(method: string, path: string, statusCode: number, statusText: string, body: string) {
    const suffix = body ? `: ${body}` : "";
    super(`${method} ${path} failed with HTTP ${statusCode} ${statusText}${suffix}`);
    this.name = "KubernetesApiError";
    this.statusCode = statusCode;
  }
}

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

function getClusterTlsOptions(
  cluster: NonNullable<ReturnType<KubeConfig["getCurrentCluster"]>>,
): Bun.TLSOptions | undefined {
  if (cluster.skipTLSVerify) {
    return { rejectUnauthorized: false };
  }

  const tls: Bun.TLSOptions = {};

  if (cluster.tlsServerName) {
    tls.serverName = cluster.tlsServerName;
  }

  if (cluster.caData) {
    tls.ca = Buffer.from(cluster.caData, "base64").toString("utf-8");
  } else if (cluster.caFile) {
    tls.ca = readFileSync(cluster.caFile, "utf-8");
  }

  return Object.keys(tls).length > 0 ? tls : undefined;
}

function headersToRecord(headers: unknown): Record<string, string> {
  const result: Record<string, string> = {};

  if (!headers || typeof headers !== "object") {
    return result;
  }

  if ("forEach" in headers && typeof headers.forEach === "function") {
    const iterableHeaders = headers as {
      forEach: (callback: (value: string, key: string) => void) => void;
    };

    iterableHeaders.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      result[key] = value.join(", ");
    } else if (typeof value === "number" || typeof value === "string") {
      result[key] = value.toString();
    }
  }

  return result;
}

function appendQuery(path: string, params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

async function k8sApiRequest<T>(
  path: string,
  { body, headers = {}, method = "GET" }: KubernetesRequestOptions = {},
): Promise<T> {
  const kc = getK8sClient();
  const cluster = kc.getCurrentCluster();
  if (!cluster) {
    throw new Error("No current cluster configured");
  }

  const fetchOptions = await kc.applyToFetchOptions({});
  const tls = getClusterTlsOptions(cluster);
  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headersToRecord(fetchOptions.headers),
    ...headers,
  };

  if (body !== undefined && !requestHeaders["Content-Type"]) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const response = await fetch(`${cluster.server}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    ...(tls ? { tls } : {}),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new KubernetesApiError(method, path, response.status, response.statusText, responseBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function customObjectPath(
  group: string,
  version: string,
  plural: string,
  name?: string,
  namespace?: string,
  subresource?: string,
): string {
  const parts = namespace
    ? ["apis", group, version, "namespaces", namespace, plural]
    : ["apis", group, version, plural];

  if (name) {
    parts.push(name);
  }
  if (subresource) {
    parts.push(subresource);
  }

  return `/${parts.map(encodeURIComponent).join("/")}`;
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
  const tls = getClusterTlsOptions(cluster);

  const controller = new AbortController();
  let doneCalled = false;
  const doneOnce = (error?: unknown) => {
    if (doneCalled) {
      return;
    }

    doneCalled = true;
    onDone(error);
  };

  async function consumeWatchStream(body: ReadableStream<Uint8Array>) {
    const stream = toNodeReadableStream(body);
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
  }

  const watchLoop = (async () => {
    try {
      const response = await fetch(url, {
        ...requestInit,
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...headersToRecord(requestInit.headers),
        },
        ...(tls ? { tls } : {}),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        doneOnce();
        return;
      }

      await consumeWatchStream(response.body);
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
  const { namespace = "", namespaced: _namespaced = true } = options;

  return {
    /**
     * List all CRDs of this type
     */
    async list(): Promise<unknown[]> {
      try {
        const path = namespace
          ? customObjectPath(group, version, plural, undefined, namespace)
          : customObjectPath(group, version, plural);

        const data = await k8sApiRequest<{ items?: unknown[] }>(path);
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
      try {
        return await k8sApiRequest<Record<string, unknown>>(
          customObjectPath(group, version, plural, name, ns),
        );
      } catch (error) {
        logger.error({ group, version, plural, name, namespace: ns, error }, "Failed to get CRD");
        throw error;
      }
    },

    /**
     * Create a CRD
     */
    async create(body: Record<string, unknown>, ns?: string) {
      try {
        return await k8sApiRequest<Record<string, unknown>>(
          customObjectPath(group, version, plural, undefined, ns),
          {
            method: "POST",
            body,
          },
        );
      } catch (error) {
        logger.error({ group, version, plural, namespace: ns, error }, "Failed to create CRD");
        throw error;
      }
    },

    /**
     * Update a CRD
     */
    async patch(name: string, body: KubernetesJsonBody, ns?: string) {
      try {
        return await k8sApiRequest<Record<string, unknown>>(
          customObjectPath(group, version, plural, name, ns),
          {
            method: "PATCH",
            body,
            headers: {
              "Content-Type": Array.isArray(body)
                ? "application/json-patch+json"
                : "application/merge-patch+json",
            },
          },
        );
      } catch (error) {
        logger.error({ group, version, plural, name, namespace: ns, error }, "Failed to patch CRD");
        throw error;
      }
    },

    /**
     * Update status subresource
     */
    async patchStatus(name: string, body: KubernetesJsonBody, ns?: string) {
      try {
        return await k8sApiRequest<Record<string, unknown>>(
          customObjectPath(group, version, plural, name, ns, "status"),
          {
            method: "PATCH",
            body,
            headers: {
              "Content-Type": Array.isArray(body)
                ? "application/json-patch+json"
                : "application/merge-patch+json",
            },
          },
        );
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
      try {
        return await k8sApiRequest<Record<string, unknown>>(
          customObjectPath(group, version, plural, name, ns),
          {
            method: "DELETE",
          },
        );
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
      const path = customObjectPath(group, version, plural, undefined, ns);

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
  return {
    createNamespacedJob({ body, namespace }: { body: V1Job; namespace: string }): Promise<V1Job> {
      return k8sApiRequest<V1Job>(
        `/apis/batch/v1/namespaces/${encodeURIComponent(namespace)}/jobs`,
        {
          method: "POST",
          body: body as Record<string, unknown>,
        },
      );
    },

    deleteNamespacedJob({
      name,
      namespace,
    }: {
      name: string;
      namespace: string;
    }): Promise<Record<string, unknown>> {
      return k8sApiRequest<Record<string, unknown>>(
        `/apis/batch/v1/namespaces/${encodeURIComponent(namespace)}/jobs/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
    },

    listJobForAllNamespaces({
      labelSelector,
    }: {
      labelSelector?: string;
    } = {}): Promise<KubernetesList<V1Job>> {
      return k8sApiRequest<KubernetesList<V1Job>>(
        appendQuery("/apis/batch/v1/jobs", { labelSelector }),
      );
    },

    listNamespacedJob({
      labelSelector,
      namespace,
    }: {
      labelSelector?: string;
      namespace: string;
    }): Promise<KubernetesList<V1Job>> {
      return k8sApiRequest<KubernetesList<V1Job>>(
        appendQuery(`/apis/batch/v1/namespaces/${encodeURIComponent(namespace)}/jobs`, {
          labelSelector,
        }),
      );
    },

    readNamespacedJob({ name, namespace }: { name: string; namespace: string }): Promise<V1Job> {
      return k8sApiRequest<V1Job>(
        `/apis/batch/v1/namespaces/${encodeURIComponent(namespace)}/jobs/${encodeURIComponent(name)}`,
      );
    },
  };
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
