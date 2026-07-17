/**
 * Yuptime Main Entry Point
 *
 * Kubernetes-native monitoring without database or built-in dashboard.
 * All configuration in CRDs, all metrics in Prometheus, all dashboards in Grafana.
 */

import { controller } from "./controller";
import { config, validateConfig } from "./lib/config";
import { logger } from "./lib/logger";
import { isRecoverableAsyncError } from "./lib/recoverable-error";
import { createMetricsServer } from "./server/metrics-server";

let metricsServer: ReturnType<typeof createMetricsServer> | null = null;

async function main() {
  try {
    // Validate configuration
    validateConfig();

    // Start Kubernetes informers, reconcilers, and the persistent Check Engine.
    logger.info("Starting Kubernetes controller...");
    await controller.start();
    logger.info("Kubernetes controller started");

    // Start metrics server for Prometheus scraping
    logger.info("Starting metrics server...");
    metricsServer = createMetricsServer({
      port: config.port,
      host: "0.0.0.0",
      ready: controller.ready,
    });
    await metricsServer.start();

    logger.info(
      {
        metricsPort: config.port,
        env: config.env,
      },
      "Yuptime started successfully (database-free, Kubernetes-native)",
    );
  } catch (error) {
    logger.error(error, "Fatal error during startup");
    process.exit(1);
  }
}

// Handle graceful shutdown
const gracefulShutdown = async () => {
  logger.info("Shutting down gracefully...");

  if (metricsServer) {
    await metricsServer.stop();
  }

  await controller.stop();

  logger.info("Shutdown complete");
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("unhandledRejection", (reason) => {
  if (isRecoverableAsyncError(reason)) {
    logger.warn({ reason }, "Recovered from unhandled async timeout/abort");
    return;
  }

  logger.error({ reason }, "Unhandled promise rejection");
  process.exit(1);
});
process.on("uncaughtException", (error) => {
  if (isRecoverableAsyncError(error)) {
    logger.warn({ error }, "Recovered from uncaught timeout/abort");
    return;
  }

  logger.error({ error }, "Uncaught exception");
  process.exit(1);
});

// Start the app
main().catch((error) => {
  logger.error(error, "Unhandled error");
  process.exit(1);
});
