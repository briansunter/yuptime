import type { KubeConfig } from "@kubernetes/client-node";
import { logger } from "../lib/logger";
import {
  informerRegistry,
  registry,
  startAllWatchers,
  stopAllWatchers,
} from "./informers";
import type { JobManager } from "./job-manager";
import { createJobManager } from "./job-manager";
import type { JobCompletionWatcher } from "./job-manager/completion-watcher";
import { createJobCompletionWatcher } from "./job-manager/completion-watcher";
import { initializeK8sClient } from "./k8s-client";
import {
  createMaintenanceWindowReconciler,
  createMonitorReconciler,
  createMonitorSetReconciler,
  createSettingsReconciler,
  createSilenceReconciler,
} from "./reconcilers";
import { createTypeSafeReconciliationHandler } from "./reconcilers/handler";
import type { TypeSafeReconciler } from "./reconcilers/types";

// Global instances
let jobManager: JobManager | null = null;
let jobCompletionWatcher: JobCompletionWatcher | null = null;

/**
 * Initialize and start the Kubernetes controller
 * Functional approach - composing pure functions and simple data structures
 */
export async function startController() {
  try {
    logger.info("Starting Kubernetes controller...");

    // Initialize Kubernetes client
    const kubeConfig = initializeK8sClient();

    // Create and start Job Manager
    jobManager = createJobManager({
      kubeConfig,
      concurrency: 10, // Configurable via Settings CRD later
      jobTTL: 3600, // 1 hour
      namespace: "yuptime",
    });
    await jobManager.start();
    logger.info("Job Manager started");

    // Create and start Job Completion Watcher
    jobCompletionWatcher = createJobCompletionWatcher({
      kubeConfig,
      namespace: "yuptime",
    });
    await jobCompletionWatcher.start();
    logger.info("Job Completion Watcher started");

    // Register all reconcilers with job manager context
    registerAllReconcilers(kubeConfig);

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

    // Stop Job Completion Watcher
    if (jobCompletionWatcher) {
      await jobCompletionWatcher.stop();
      jobCompletionWatcher = null;
    }

    // Stop Job Manager
    if (jobManager) {
      await jobManager.stop();
      jobManager = null;
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
function registerAllReconcilers(kubeConfig: KubeConfig) {
  logger.debug("Registering reconcilers...");

  // Create reconciliation context with job manager
  const reconcileContext = {
    jobManager,
    kubeConfig,
  };

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

    logger.debug(
      { kind: config.kind },
      `Registered reconciler for ${config.kind}`,
    );
  }

  logger.debug("All reconcilers registered");
}

/**
 * Export controller as singleton instance
 */
export const controller = {
  start: startController,
  stop: stopController,
};
