/**
 * Minimal server entry point for testing
 * Starts only the Fastify API server without controller/scheduler
 */

import { initializeDatabase } from "./db";
import { config, validateConfig } from "./lib/config";
import { logger } from "./lib/logger";
import { createApp } from "./server/app";

async function main() {
  try {
    // Validate configuration
    validateConfig();

    // Initialize database
    logger.info("Initializing database...");
    await initializeDatabase();
    logger.info("Database initialized");

    // Create Fastify app
    logger.info("Creating Fastify app...");
    const app = await createApp();

    // Start server
    await app.listen({ port: config.port, host: "0.0.0.0" });

    logger.info(
      {
        port: config.port,
        env: config.env,
        database: config.isPostgres ? "PostgreSQL" : "SQLite",
      },
      `KubeKuma API server started successfully`,
    );
  } catch (error) {
    logger.error(error, "Fatal error during startup");
    process.exit(1);
  }
}

// Handle graceful shutdown
const gracefulShutdown = async () => {
  logger.info("Shutting down gracefully...");
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// Start the app
main().catch((error) => {
  logger.error(error, "Unhandled error");
  process.exit(1);
});
