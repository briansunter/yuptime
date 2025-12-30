import { logger } from "../../lib/logger";
import { createCRDWatcher } from "../k8s-client";
import type { DiscoveredMonitor } from "./types";

// Labels for discovered monitors
const MANAGED_LABEL = "monitoring.yuptime.io/managed-by";
const SOURCE_ANNOTATION = "monitoring.yuptime.io/discovery-source";

/**
 * Create or update a Monitor CRD from a discovered resource
 */
export async function createOrUpdateMonitor(
  discovered: DiscoveredMonitor,
  writeCrds: boolean,
): Promise<void> {
  if (!writeCrds) {
    logger.info(
      {
        name: discovered.name,
        namespace: discovered.namespace,
        source: `${discovered.source.kind}/${discovered.source.namespace}/${discovered.source.name}`,
      },
      "Discovered monitor (dry-run, writeCrds=false)",
    );
    return;
  }

  const watcher = createCRDWatcher("monitoring.yuptime.io", "v1", "monitors");

  const monitorCRD = {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: {
      name: discovered.name,
      namespace: discovered.namespace,
      labels: {
        [MANAGED_LABEL]: "discovery",
      },
      annotations: {
        [SOURCE_ANNOTATION]: `${discovered.source.kind}/${discovered.source.namespace}/${discovered.source.name}`,
      },
    },
    spec: {
      enabled: true,
      type: discovered.type,
      schedule: {
        intervalSeconds: discovered.intervalSeconds,
        timeoutSeconds: discovered.timeoutSeconds,
      },
      target: discovered.target,
    },
  };

  try {
    // Try to get existing monitor
    await watcher.get(discovered.name, discovered.namespace);

    // Monitor exists, update it
    await watcher.patch(discovered.name, monitorCRD, discovered.namespace);
    logger.info(
      { name: discovered.name, namespace: discovered.namespace },
      "Updated discovered Monitor",
    );
  } catch (_error) {
    // Monitor doesn't exist, create it
    try {
      await watcher.create(monitorCRD, discovered.namespace);
      logger.info(
        { name: discovered.name, namespace: discovered.namespace },
        "Created discovered Monitor",
      );
    } catch (createError) {
      logger.error(
        { name: discovered.name, namespace: discovered.namespace, error: createError },
        "Failed to create discovered Monitor",
      );
    }
  }
}

/**
 * Delete a Monitor CRD that was created by discovery
 */
export async function deleteMonitor(
  name: string,
  namespace: string,
  writeCrds: boolean,
): Promise<void> {
  if (!writeCrds) {
    logger.info({ name, namespace }, "Would delete discovered Monitor (dry-run, writeCrds=false)");
    return;
  }

  const watcher = createCRDWatcher("monitoring.yuptime.io", "v1", "monitors");

  try {
    // Check if the monitor exists and was created by discovery
    const existing = await watcher.get(name, namespace);
    const labels = (existing as { metadata?: { labels?: Record<string, string> } })?.metadata
      ?.labels;

    if (labels?.[MANAGED_LABEL] !== "discovery") {
      logger.debug({ name, namespace }, "Monitor not managed by discovery, skipping deletion");
      return;
    }

    await watcher.delete(name, namespace);
    logger.info({ name, namespace }, "Deleted discovered Monitor");
  } catch (error) {
    // Monitor might not exist, which is fine
    logger.debug({ name, namespace, error }, "Could not delete discovered Monitor (may not exist)");
  }
}
