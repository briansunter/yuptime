/**
 * Yuptime Main Entry Point
 *
 * Kubernetes-native monitoring without database or built-in dashboard.
 * All configuration in CRDs, all metrics in Prometheus, all dashboards in Grafana.
 */

import { controller } from "./controller";
import { config, validateConfig } from "./lib/config";
import { logger } from "./lib/logger";
import { createMetricsServer } from "./server/metrics-server";

let metricsServer: ReturnType<typeof createMetricsServer> | null = null;

async function main() {
  try {
    // Validate configuration
    validateConfig();

    // Start Kubernetes controller (includes informers, reconcilers, job completion watcher)
    logger.info("Starting Kubernetes controller...");
    await controller.start();
    logger.info("Kubernetes controller started");

    // Start metrics server for Prometheus scraping
    logger.info("Starting metrics server...");
    metricsServer = createMetricsServer({
      port: config.port || 3000,
      host: "0.0.0.0",
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

// Start the app
main().catch((error) => {
  logger.error(error, "Unhandled error");
  process.exit(1);
});
