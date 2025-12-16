import { logger } from "../lib/logger";
import { createCRDWatcher } from "./k8s-client";
import { getDatabase } from "../db";

const GROUP = "monitoring.kubekuma.io";
const VERSION = "v1";

/**
 * Define all CRD types and their metadata
 */
const CRD_DEFINITIONS = {
  Monitor: { plural: "monitors", namespaced: true },
  MonitorSet: { plural: "monitorsets", namespaced: true },
  NotificationProvider: { plural: "notificationproviders", namespaced: true },
  NotificationPolicy: { plural: "notificationpolicies", namespaced: true },
  StatusPage: { plural: "statuspages", namespaced: true },
  MaintenanceWindow: { plural: "maintenancewindows", namespaced: true },
  Silence: { plural: "silences", namespaced: true },
  LocalUser: { plural: "localusers", namespaced: true },
  ApiKey: { plural: "apikeys", namespaced: true },
  KubeKumaSettings: { plural: "kubekumasettings", namespaced: false },
};

/**
 * Handler function types
 */
type ReconcileFn = (resource: any) => Promise<void>;
type ReconcileDeleteFn = (namespace: string, name: string) => Promise<void>;

/**
 * Registry interface - holds all reconcilers and watchers
 */
interface Registry {
  reconcilers: Map<string, ReconcileFn>;
  deleteHandlers: Map<string, ReconcileDeleteFn>;
  watchers: Map<string, any>;
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
  registerReconciler: (registry: Registry, kind: string, handler: ReconcileFn) => {
    registry.reconcilers.set(kind, handler);
  },

  registerDeleteHandler: (registry: Registry, kind: string, handler: ReconcileDeleteFn) => {
    registry.deleteHandlers.set(kind, handler);
  },

  handleAdd: async (registry: Registry, kind: string, resource: any) => {
    const handler = registry.reconcilers.get(kind);
    if (handler) {
      try {
        await handler(resource);
      } catch (error) {
        logger.error(
          {
            kind,
            name: resource.metadata?.name,
            namespace: resource.metadata?.namespace,
            error,
          },
          "Reconciliation failed on add"
        );
      }
    }
  },

  handleModify: async (registry: Registry, kind: string, resource: any) => {
    const handler = registry.reconcilers.get(kind);
    if (handler) {
      try {
        await handler(resource);
      } catch (error) {
        logger.error(
          {
            kind,
            name: resource.metadata?.name,
            namespace: resource.metadata?.namespace,
            error,
          },
          "Reconciliation failed on modify"
        );
      }
    }
  },

  handleDelete: async (registry: Registry, kind: string, resource: any) => {
    const handler = registry.deleteHandlers.get(kind);
    if (handler) {
      try {
        await handler(resource.metadata?.namespace, resource.metadata?.name);
      } catch (error) {
        logger.error(
          {
            kind,
            name: resource.metadata?.name,
            namespace: resource.metadata?.namespace,
            error,
          },
          "Deletion handler failed"
        );
      }
    }
  },

  setWatcher: (registry: Registry, kind: string, watcher: any) => {
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
 * Cache resource in database
 */
async function cacheResource(resource: any) {
  try {
    const db = getDatabase();
    const kind = resource.kind;
    const namespace = resource.metadata?.namespace || "";
    const name = resource.metadata?.name;
    const generation = resource.metadata?.generation || 0;
    const resourceVersion = resource.metadata?.resourceVersion;

    const { crdCache } = require("../db/schema");

    // Try insert (will fail if already exists, which is fine)
    try {
      await db.insert(crdCache).values({
        kind,
        apiVersion: resource.apiVersion,
        namespace,
        name,
        generation,
        resourceVersion,
        spec: JSON.stringify(resource.spec || {}),
        status: JSON.stringify(resource.status || {}),
        labels: JSON.stringify(resource.metadata?.labels || {}),
        annotations: JSON.stringify(resource.metadata?.annotations || {}),
      });
    } catch {
      // Already exists, ignore
    }
  } catch (error) {
    logger.debug({ error }, "Failed to cache resource");
  }
}

/**
 * Update cached resource
 */
async function updateCachedResource(resource: any) {
  try {
    const db = getDatabase();
    const { crdCache } = require("../db/schema");
    const { eq, and } = require("drizzle-orm");

    await db
      .update(crdCache)
      .set({
        generation: resource.metadata?.generation || 0,
        resourceVersion: resource.metadata?.resourceVersion,
        spec: JSON.stringify(resource.spec || {}),
        status: JSON.stringify(resource.status || {}),
        labels: JSON.stringify(resource.metadata?.labels || {}),
        annotations: JSON.stringify(resource.metadata?.annotations || {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(crdCache.kind, resource.kind),
          eq(crdCache.namespace, resource.metadata?.namespace || ""),
          eq(crdCache.name, resource.metadata?.name)
        )
      );
  } catch (error) {
    logger.warn({ error }, "Failed to update cached resource");
  }
}

/**
 * Remove cached resource
 */
async function removeCachedResource(kind: string, namespace: string, name: string) {
  try {
    const db = getDatabase();
    const { crdCache } = require("../db/schema");
    const { eq, and } = require("drizzle-orm");

    await db
      .delete(crdCache)
      .where(
        and(eq(crdCache.kind, kind), eq(crdCache.namespace, namespace), eq(crdCache.name, name))
      );
  } catch (error) {
    logger.warn({ error }, "Failed to remove cached resource");
  }
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
      `Loaded ${resources.length} existing ${kind} resources`
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
        case "DELETED":
          removeCachedResource(kind, resource.metadata?.namespace, resource.metadata?.name);
          registry.handleDelete(informerRegistry, kind, resource);
          break;
      }
    },
    (error) => {
      logger.error({ kind, error }, `Watcher error for ${kind}`);
      // Could implement reconnection logic here
    }
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
