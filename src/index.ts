import { logger } from "./lib/logger";
import { config, validateConfig } from "./lib/config";
import { createApp } from "./server/app";
import { initializeDatabase } from "./db";
import { controller } from "./controller";
import { startDeliveryWorker, stopDeliveryWorker } from "./alerting";

let deliveryWorker: NodeJS.Timer | null = null;

async function main() {
  try {
    // Validate configuration
    validateConfig();

    // Initialize database
    logger.info("Initializing database...");
    await initializeDatabase();
    logger.info("Database initialized");

    // Start Kubernetes controller (includes job manager and completion watcher)
    logger.info("Starting Kubernetes controller...");
    await controller.start();
    logger.info("Kubernetes controller started");

    // Start notification delivery worker
    logger.info("Starting notification delivery worker...");
    deliveryWorker = startDeliveryWorker();
    logger.info("Notification delivery worker started");

    // Create Fastify app
    logger.info("Creating Fastify app...");
    const app = await createApp();

    // Start server
    await app.listen({ port: config.port, host: "0.0.0.0" });

    logger.info(
      {
        port: config.port,
        env: config.env,
        database: config.dbType === "etcd" ? "etcd" : config.isPostgres ? "PostgreSQL" : "SQLite",
      },
      `KubeKuma server started successfully`
    );
  } catch (error) {
    logger.error(error, "Fatal error during startup");
    process.exit(1);
  }
}

// Handle graceful shutdown
const gracefulShutdown = async () => {
  logger.info("Shutting down gracefully...");

  if (deliveryWorker) {
    stopDeliveryWorker(deliveryWorker);
  }

  await controller.stop();
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// Start the app
main().catch((error) => {
  logger.error(error, "Unhandled error");
  process.exit(1);
});
