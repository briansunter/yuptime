import {
  cacheResource as cacheResourceInMemory,
  removeCachedResource as removeCachedResourceInMemory,
  updateCachedResource as updateCachedResourceInMemory,
} from "../lib/crd-cache";
import { logger } from "../lib/logger";
import { createCRDWatcher } from "./k8s-client";

const GROUP = "monitoring.yuptime.io";
const VERSION = "v1";

/**
 * Define all CRD types and their metadata
 */
const CRD_DEFINITIONS = {
  Monitor: { plural: "monitors", namespaced: true },
  MonitorSet: { plural: "monitorsets", namespaced: true },
  MaintenanceWindow: { plural: "maintenancewindows", namespaced: true },
  Silence: { plural: "silences", namespaced: true },
  YuptimeSettings: { plural: "yuptimesettings", namespaced: false },
};

/**
 * Handler function types
 */
type ReconcileFn = (resource: unknown) => Promise<void>;
type ReconcileDeleteFn = (namespace: string, name: string) => Promise<void>;

/**
 * Registry interface - holds all reconcilers and watchers
 */
interface Registry {
  reconcilers: Map<string, ReconcileFn>;
  deleteHandlers: Map<string, ReconcileDeleteFn>;
  watchers: Map<string, { abort?: () => void }>;
}

/**
 * Create a new registry instance
 */
const createRegistry = (): Registry => ({
  reconcilers: new Map(),
  deleteHandlers: new Map(),
  watchers: new Map(),
});

/**
 * Create registry functions (composition over classes)
 */
const registryFunctions = {
  registerReconciler: (
    registry: Registry,
    kind: string,
    handler: ReconcileFn,
  ) => {
    registry.reconcilers.set(kind, handler);
  },

  registerDeleteHandler: (
    registry: Registry,
    kind: string,
    handler: ReconcileDeleteFn,
  ) => {
    registry.deleteHandlers.set(kind, handler);
  },

  handleAdd: async (registry: Registry, kind: string, resource: unknown) => {
    const handler = registry.reconcilers.get(kind);
    if (handler) {
      try {
        await handler(resource);
      } catch (error) {
        const metadata =
          typeof resource === "object" && resource !== null
            ? (resource as Record<string, unknown>).metadata
            : null;
        logger.error(
          {
            kind,
            name: (metadata as Record<string, unknown>)?.name,
            namespace: (metadata as Record<string, unknown>)?.namespace,
            error,
          },
          "Reconciliation failed on add",
        );
      }
    }
  },

  handleModify: async (registry: Registry, kind: string, resource: unknown) => {
    const handler = registry.reconcilers.get(kind);
    if (handler) {
      try {
        await handler(resource);
      } catch (error) {
        const metadata =
          typeof resource === "object" && resource !== null
            ? (resource as Record<string, unknown>).metadata
            : null;
        logger.error(
          {
            kind,
            name: (metadata as Record<string, unknown>)?.name,
            namespace: (metadata as Record<string, unknown>)?.namespace,
            error,
          },
          "Reconciliation failed on modify",
        );
      }
    }
  },

  handleDelete: async (registry: Registry, kind: string, resource: unknown) => {
    const handler = registry.deleteHandlers.get(kind);
    if (handler) {
      try {
        const metadata =
          typeof resource === "object" && resource !== null
            ? (resource as Record<string, unknown>).metadata
            : null;
        await handler(
          (metadata as Record<string, unknown>)?.namespace as string,
          (metadata as Record<string, unknown>)?.name as string,
        );
      } catch (error) {
        const metadata =
          typeof resource === "object" && resource !== null
            ? (resource as Record<string, unknown>).metadata
            : null;
        logger.error(
          {
            kind,
            name: (metadata as Record<string, unknown>)?.name,
            namespace: (metadata as Record<string, unknown>)?.namespace,
            error,
          },
          "Deletion handler failed",
        );
      }
    }
  },

  setWatcher: (
    registry: Registry,
    kind: string,
    watcher: { abort?: () => void },
  ) => {
    registry.watchers.set(kind, watcher);
  },

  getWatcher: (registry: Registry, kind: string) => {
    return registry.watchers.get(kind);
  },

  stopAll: async (registry: Registry) => {
    for (const watcher of registry.watchers.values()) {
      if (watcher?.abort) {
        watcher.abort();
      }
    }
    registry.watchers.clear();
  },
};

/**
 * Export the singleton registry
 */
export const informerRegistry = createRegistry();

/**
 * Export registry functions for use throughout the controller
 */
export const registry = registryFunctions;

/**
 * Cache resource in memory
 */
function cacheResource(resource: unknown) {
  cacheResourceInMemory(resource);
}

/**
 * Update cached resource
 */
function updateCachedResource(resource: unknown) {
  updateCachedResourceInMemory(resource);
}

/**
 * Remove cached resource
 */
function removeCachedResource(kind: string, namespace: string, name: string) {
  removeCachedResourceInMemory(kind, namespace, name);
}

/**
 * Start watching a single CRD type
 */
export async function startCRDWatcher(kind: keyof typeof CRD_DEFINITIONS) {
  const def = CRD_DEFINITIONS[kind];
  const watcher = createCRDWatcher(GROUP, VERSION, def.plural);

  logger.info({ kind }, `Starting watcher for ${kind}`);

  // List existing resources
  try {
    const resources = await watcher.list();
    for (const resource of resources) {
      await cacheResource(resource);
      await registry.handleAdd(informerRegistry, kind, resource);
    }
    logger.info(
      { kind, count: resources.length },
      `Loaded ${resources.length} existing ${kind} resources`,
    );
  } catch (error) {
    logger.error({ kind, error }, `Failed to list ${kind} resources`);
  }

  // Watch for changes
  const watchAbort = await watcher.watch(
    (phase, obj) => {
      const resource = obj;

      switch (phase) {
        case "ADDED":
          cacheResource(resource);
          registry.handleAdd(informerRegistry, kind, resource);
          break;
        case "MODIFIED":
          updateCachedResource(resource);
          registry.handleModify(informerRegistry, kind, resource);
          break;
        case "DELETED": {
          const metadata = (
            resource as { metadata?: { namespace?: string; name?: string } }
          ).metadata;
          if (metadata?.namespace && metadata?.name) {
            removeCachedResource(kind, metadata.namespace, metadata.name);
          }
          registry.handleDelete(informerRegistry, kind, resource);
          break;
        }
      }
    },
    (error) => {
      logger.error({ kind, error }, `Watcher error for ${kind}`);
      // Could implement reconnection logic here
    },
  );

  registry.setWatcher(informerRegistry, kind, watchAbort);
}

/**
 * Start all CRD watchers
 */
export async function startAllWatchers() {
  logger.info("Starting CRD watchers...");

  for (const kind of Object.keys(CRD_DEFINITIONS)) {
    try {
      await startCRDWatcher(kind as keyof typeof CRD_DEFINITIONS);
    } catch (error) {
      logger.error({ kind, error }, `Failed to start watcher for ${kind}`);
    }
  }

  logger.info("All CRD watchers started");
}

/**
 * Stop all watchers
 */
export async function stopAllWatchers() {
  logger.info("Stopping all CRD watchers...");
  await registry.stopAll(informerRegistry);
  logger.info("All CRD watchers stopped");
}
