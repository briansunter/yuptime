import type { CheckEngine } from "../check-engine";
import { createCheckEngine } from "../check-engine";
import { createKubernetesResultPublisher } from "../check-engine/kubernetes-publisher";
import { createKubernetesJobRunner } from "../check-runner/kubernetes-job-runner";
import { createSidecarRunner } from "../check-runner/sidecar-runner";
import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { informerRegistry, registry, startAllWatchers, stopAllWatchers } from "./informers";
import { initializeK8sClient } from "./k8s-client";
import {
  createMaintenanceWindowReconciler,
  createMonitorReconciler,
  createMonitorSetReconciler,
  createSettingsReconciler,
  createSilenceReconciler,
} from "./reconcilers";
import {
  createTypeSafeDeleteHandler,
  createTypeSafeReconciliationHandler,
} from "./reconcilers/handler";
import { stopSafetyNet } from "./reconcilers/monitor-reconciler";
import type { TypeSafeReconciler } from "./reconcilers/types";

// Global instances
let checkEngine: CheckEngine | null = null;

/**
 * Initialize and start the Kubernetes controller
 * Functional approach - composing pure functions and simple data structures
 */
export async function startController() {
  try {
    logger.info("Starting Kubernetes controller...");

    // Initialize Kubernetes client
    initializeK8sClient();

    const runner =
      config.executionMode === "sidecar"
        ? createSidecarRunner(config.checkerUrl)
        : createKubernetesJobRunner(config.jobTTLSeconds);
    checkEngine = createCheckEngine({
      runner,
      publisher: createKubernetesResultPublisher(),
      concurrency: config.executionConcurrency,
      queueCapacity: config.executionQueueCapacity,
    });
    await checkEngine.start();
    logger.info({ mode: config.executionMode }, "Check Engine started");

    // Register all reconcilers with job manager context
    registerAllReconcilers();

    // Start watching all CRD types
    await startAllWatchers();

    logger.info("Kubernetes controller started successfully");
  } catch (error) {
    logger.error(error, "Failed to start controller");
    throw error;
  }
}

/**
 * Stop the controller
 */
export async function stopController() {
  try {
    logger.info("Stopping Kubernetes controller...");

    // Stop the periodic validation safety net.
    stopSafetyNet();

    if (checkEngine) {
      await checkEngine.stop(config.shutdownGraceMs);
      checkEngine = null;
    }

    await stopAllWatchers();
    logger.info("Kubernetes controller stopped");
  } catch (error) {
    logger.error(error, "Error stopping controller");
  }
}

/**
 * Register all reconcilers with the informer registry
 * Using functional composition and factory functions
 */
function registerAllReconcilers() {
  logger.debug("Registering reconcilers...");

  const reconcileContext = { checkEngine };

  // Create reconciler configs using factory functions
  const reconcilers = [
    createMonitorReconciler(),
    createMonitorSetReconciler(),
    createMaintenanceWindowReconciler(),
    createSilenceReconciler(),
    createSettingsReconciler(),
  ];

  // Register each reconciler
  for (const config of reconcilers) {
    // Use type-safe handler for all reconcilers
    // The handler parses with Zod, so it works with both legacy and type-safe configs
    const handler = createTypeSafeReconciliationHandler(
      config as unknown as TypeSafeReconciler<object>,
      reconcileContext,
    );

    // Register with the informer registry
    registry.registerReconciler(informerRegistry, config.kind, handler);

    if (config.deleteHandler) {
      registry.registerDeleteHandler(
        informerRegistry,
        config.kind,
        createTypeSafeDeleteHandler(
          config as unknown as TypeSafeReconciler<object>,
          reconcileContext,
        ),
      );
    }

    logger.debug({ kind: config.kind }, `Registered reconciler for ${config.kind}`);
  }

  logger.debug("All reconcilers registered");
}

/**
 * Export controller as singleton instance
 */
export const controller = {
  start: startController,
  stop: stopController,
  ready: () => {
    const snapshot = checkEngine?.snapshot();
    if (!snapshot?.running || !snapshot.runnerReady || !snapshot.lastTickAt) return false;
    return (
      Date.now() - Date.parse(snapshot.lastTickAt) < 90_000 && snapshot.oldestQueuedMs < 60_000
    );
  },
};
