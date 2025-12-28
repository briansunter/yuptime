import { logger } from "../lib/logger";
import { initializeK8sClient, getK8sClient } from "./k8s-client";
import { startAllWatchers, stopAllWatchers, informerRegistry, registry } from "./informers";
import { createReconciliationHandler } from "./reconcilers/handler";
import {
  createMonitorReconciler,
  createMonitorSetReconciler,
  createNotificationProviderReconciler,
  createNotificationPolicyReconciler,
  createStatusPageReconciler,
  createMaintenanceWindowReconciler,
  createSilenceReconciler,
  createLocalUserReconciler,
  createApiKeyReconciler,
  createSettingsReconciler,
} from "./reconcilers";
import { createJobManager } from "./job-manager";
import { createJobCompletionWatcher } from "./job-manager/completion-watcher";

// Global instances
let jobManager: any = null;
let jobCompletionWatcher: any = null;

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
      namespace: "kubekuma",
    });
    await jobManager.start();
    logger.info("Job Manager started");

    // Create and start Job Completion Watcher
    jobCompletionWatcher = createJobCompletionWatcher(kubeConfig);
    await jobCompletionWatcher.start();
    logger.info("Job Completion Watcher started");

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
function registerAllReconcilers() {
  logger.debug("Registering reconcilers...");

  // Create reconciliation context with job manager
  const reconcileContext = {
    jobManager,
  };

  // Create reconciler configs using factory functions
  const reconcilers = [
    createMonitorReconciler(),
    createMonitorSetReconciler(),
    createNotificationProviderReconciler(),
    createNotificationPolicyReconciler(),
    createStatusPageReconciler(),
    createMaintenanceWindowReconciler(),
    createSilenceReconciler(),
    createLocalUserReconciler(),
    createApiKeyReconciler(),
    createSettingsReconciler(),
  ];

  // Register each reconciler
  for (const config of reconcilers) {
    // Create the reconciliation handler with error handling and context
    const handler = createReconciliationHandler(config, reconcileContext);

    // Register with the informer registry
    registry.registerReconciler(informerRegistry, config.kind, handler);

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
};
