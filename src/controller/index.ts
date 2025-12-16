import { logger } from "../lib/logger";
import { initializeK8sClient } from "./k8s-client";
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

/**
 * Initialize and start the Kubernetes controller
 * Functional approach - composing pure functions and simple data structures
 */
export async function startController() {
  try {
    logger.info("Starting Kubernetes controller...");

    // Initialize Kubernetes client
    initializeK8sClient();

    // Register all reconcilers
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
    // Create the reconciliation handler with error handling
    const handler = createReconciliationHandler(config);

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
