import type { V1Service } from "@kubernetes/client-node";
import { Watch } from "@kubernetes/client-node";
import { logger } from "../../lib/logger";
import { getK8sClient } from "../k8s-client";
import { createOrUpdateMonitor, deleteMonitor } from "./crd-writer";
import type { DiscoveryConfig } from "./index";
import type { DiscoveredMonitor } from "./types";

// Annotation constants
const ANNOTATION_PREFIX = "monitoring.yuptime.io";
const ANNOTATION_ENABLED = `${ANNOTATION_PREFIX}/enabled`;
const ANNOTATION_CHECK_TYPE = `${ANNOTATION_PREFIX}/check-type`;
const ANNOTATION_HEALTH_PATH = `${ANNOTATION_PREFIX}/health-path`;
const ANNOTATION_INTERVAL = `${ANNOTATION_PREFIX}/interval-seconds`;
const ANNOTATION_TIMEOUT = `${ANNOTATION_PREFIX}/timeout-seconds`;
const ANNOTATION_PORT = `${ANNOTATION_PREFIX}/port`;

let watchAbortController: AbortController | null = null;

/**
 * Extract monitor configuration from Service annotations
 */
function extractMonitorFromService(
  service: V1Service,
  config: DiscoveryConfig,
): DiscoveredMonitor | null {
  const annotations = service.metadata?.annotations || {};
  const namespace = service.metadata?.namespace || "default";
  const name = service.metadata?.name || "";

  // Check if monitoring is enabled
  if (annotations[ANNOTATION_ENABLED] !== "true") {
    return null;
  }

  const checkType = annotations[ANNOTATION_CHECK_TYPE] || "http";
  const healthPath = annotations[ANNOTATION_HEALTH_PATH] || config.behavior.defaultHealthPath;
  const intervalSeconds = Number.parseInt(annotations[ANNOTATION_INTERVAL] || "60", 10);
  const timeoutSeconds = Number.parseInt(annotations[ANNOTATION_TIMEOUT] || "10", 10);

  // Get port from annotation or first service port
  const annotatedPort = annotations[ANNOTATION_PORT];
  const port = annotatedPort
    ? Number.parseInt(annotatedPort, 10)
    : service.spec?.ports?.[0]?.port || 80;

  // Build target based on check type
  const serviceAddress = `${name}.${namespace}.svc.cluster.local`;
  let target: DiscoveredMonitor["target"];

  switch (checkType) {
    case "http":
      target = {
        http: {
          url: `http://${serviceAddress}:${port}${healthPath}`,
        },
      };
      break;

    case "https":
      target = {
        http: {
          url: `https://${serviceAddress}:${port}${healthPath}`,
          tls: { verify: false }, // Internal services often use self-signed certs
        },
      };
      break;

    case "tcp":
      target = {
        tcp: {
          host: serviceAddress,
          port,
        },
      };
      break;

    case "grpc":
      target = {
        grpc: {
          host: serviceAddress,
          port,
        },
      };
      break;

    default:
      logger.warn(
        { service: name, namespace, checkType },
        "Unsupported check type in service annotation, defaulting to http",
      );
      target = {
        http: {
          url: `http://${serviceAddress}:${port}${healthPath}`,
        },
      };
  }

  return {
    name: `auto-svc-${name}`,
    namespace,
    type: checkType === "https" ? "http" : checkType,
    intervalSeconds,
    timeoutSeconds,
    target,
    source: {
      kind: "Service",
      name,
      namespace,
    },
  };
}

/**
 * Start watching Services for monitoring annotations
 */
export async function startServiceWatcher(config: DiscoveryConfig): Promise<void> {
  const kc = getK8sClient();
  const watch = new Watch(kc);

  watchAbortController = new AbortController();

  try {
    await watch.watch(
      "/api/v1/services",
      {},
      async (phase: string, service: V1Service) => {
        const discovered = extractMonitorFromService(service, config);

        if (!discovered) {
          // Service doesn't have monitoring enabled
          // Check if we need to clean up an existing monitor
          if (phase === "DELETED" && service.metadata?.annotations?.[ANNOTATION_ENABLED]) {
            const namespace = service.metadata?.namespace || "default";
            const name = service.metadata?.name || "";
            await deleteMonitor(`auto-svc-${name}`, namespace, config.behavior.writeCrds);
          }
          return;
        }

        switch (phase) {
          case "ADDED":
          case "MODIFIED":
            logger.debug({ discovered }, "Discovered service for monitoring");
            await createOrUpdateMonitor(discovered, config.behavior.writeCrds);
            break;

          case "DELETED":
            logger.debug({ discovered }, "Service deleted, removing monitor");
            await deleteMonitor(discovered.name, discovered.namespace, config.behavior.writeCrds);
            break;
        }
      },
      (err) => {
        if (err && !watchAbortController?.signal.aborted) {
          logger.error({ err }, "Service watch error");
        }
      },
    );
  } catch (error) {
    logger.error({ error }, "Failed to start service watcher");
    throw error;
  }
}

/**
 * Stop the service watcher
 */
export function stopServiceWatcher(): void {
  if (watchAbortController) {
    watchAbortController.abort();
    watchAbortController = null;
  }
}
