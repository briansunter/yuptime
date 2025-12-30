import type { V1Ingress } from "@kubernetes/client-node";
import { Watch } from "@kubernetes/client-node";
import { logger } from "../../lib/logger";
import { getK8sClient } from "../k8s-client";
import { createOrUpdateMonitor, deleteMonitor } from "./crd-writer";
import type { DiscoveryConfig } from "./index";
import type { DiscoveredMonitor } from "./types";

// Annotation constants
const ANNOTATION_PREFIX = "monitoring.yuptime.io";
const ANNOTATION_ENABLED = `${ANNOTATION_PREFIX}/enabled`;
const ANNOTATION_INTERVAL = `${ANNOTATION_PREFIX}/interval-seconds`;
const ANNOTATION_TIMEOUT = `${ANNOTATION_PREFIX}/timeout-seconds`;
const ANNOTATION_VERIFY_TLS = `${ANNOTATION_PREFIX}/verify-tls`;

let watchAbortController: AbortController | null = null;

/**
 * Sanitize a string for use in Kubernetes resource names
 */
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 63);
}

/**
 * Extract monitor configurations from Ingress
 * Creates one monitor per host/path combination
 */
function extractMonitorsFromIngress(
  ingress: V1Ingress,
  _config: DiscoveryConfig,
): DiscoveredMonitor[] {
  const annotations = ingress.metadata?.annotations || {};
  const namespace = ingress.metadata?.namespace || "default";
  const ingressName = ingress.metadata?.name || "";

  // Check if monitoring is enabled
  if (annotations[ANNOTATION_ENABLED] !== "true") {
    return [];
  }

  const intervalSeconds = Number.parseInt(annotations[ANNOTATION_INTERVAL] || "60", 10);
  const timeoutSeconds = Number.parseInt(annotations[ANNOTATION_TIMEOUT] || "10", 10);
  const verifyTls = annotations[ANNOTATION_VERIFY_TLS] !== "false";

  const monitors: DiscoveredMonitor[] = [];

  // Check if TLS is configured for any host
  const tlsHosts = new Set<string>();
  for (const tls of ingress.spec?.tls || []) {
    for (const host of tls.hosts || []) {
      tlsHosts.add(host);
    }
  }

  // Create monitors for each rule
  for (const rule of ingress.spec?.rules || []) {
    const host = rule.host || "";
    if (!host) continue;

    const useTls = tlsHosts.has(host);
    const protocol = useTls ? "https" : "http";

    // Create a monitor for each path (or just one for the root if no paths defined)
    const paths = rule.http?.paths || [{ path: "/" }];

    for (const pathSpec of paths) {
      const path = pathSpec.path || "/";
      const monitorName = `auto-ing-${sanitizeName(ingressName)}-${sanitizeName(host)}`;

      monitors.push({
        name: monitorName,
        namespace,
        type: "http",
        intervalSeconds,
        timeoutSeconds,
        target: {
          http: {
            url: `${protocol}://${host}${path}`,
            tls: useTls ? { verify: verifyTls } : undefined,
          },
        },
        source: {
          kind: "Ingress",
          name: ingressName,
          namespace,
        },
      });

      // Only create one monitor per host (first path)
      break;
    }
  }

  return monitors;
}

/**
 * Start watching Ingresses for monitoring annotations
 */
export async function startIngressWatcher(config: DiscoveryConfig): Promise<void> {
  const kc = getK8sClient();
  const watch = new Watch(kc);

  watchAbortController = new AbortController();

  try {
    await watch.watch(
      "/apis/networking.k8s.io/v1/ingresses",
      {},
      async (phase: string, ingress: V1Ingress) => {
        const monitors = extractMonitorsFromIngress(ingress, config);

        if (monitors.length === 0) {
          // Ingress doesn't have monitoring enabled
          // Check if we need to clean up existing monitors
          if (phase === "DELETED" && ingress.metadata?.annotations?.[ANNOTATION_ENABLED]) {
            const namespace = ingress.metadata?.namespace || "default";
            const ingressName = ingress.metadata?.name || "";

            // Clean up all monitors that might have been created for this ingress
            for (const rule of ingress.spec?.rules || []) {
              const host = rule.host || "";
              if (host) {
                const monitorName = `auto-ing-${sanitizeName(ingressName)}-${sanitizeName(host)}`;
                await deleteMonitor(monitorName, namespace, config.behavior.writeCrds);
              }
            }
          }
          return;
        }

        switch (phase) {
          case "ADDED":
          case "MODIFIED":
            for (const discovered of monitors) {
              logger.debug({ discovered }, "Discovered ingress for monitoring");
              await createOrUpdateMonitor(discovered, config.behavior.writeCrds);
            }
            break;

          case "DELETED":
            for (const discovered of monitors) {
              logger.debug({ discovered }, "Ingress deleted, removing monitor");
              await deleteMonitor(discovered.name, discovered.namespace, config.behavior.writeCrds);
            }
            break;
        }
      },
      (err) => {
        if (err && !watchAbortController?.signal.aborted) {
          logger.error({ err }, "Ingress watch error");
        }
      },
    );
  } catch (error) {
    logger.error({ error }, "Failed to start ingress watcher");
    throw error;
  }
}

/**
 * Stop the ingress watcher
 */
export function stopIngressWatcher(): void {
  if (watchAbortController) {
    watchAbortController.abort();
    watchAbortController = null;
  }
}
