#!/usr/bin/env bun
/**
 * Checker Executor CLI
 * Entry point for Job pods to execute monitor checks
 *
 * Usage:
 *   checker-executor --monitor namespace/name
 */

import { parseArgs } from "node:util";
import { initializeDatabase } from "../db";
import { executeCheck, writeHeartbeat } from "./executor";

const logger = console;

/**
 * Main execution function
 */
async function main() {
  // Parse command-line arguments (skip first two: bun executable and script path)
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      monitor: {
        type: "string",
        required: true,
      },
    },
  });

  const monitorRef = values.monitor;
  if (!monitorRef) {
    logger.error("Missing --monitor argument");
    process.exit(2);
  }

  // Parse namespace/name
  const [namespace, name] = monitorRef.split("/");
  if (!namespace || !name) {
    logger.error(`Invalid monitor reference: ${monitorRef}`);
    logger.error("Expected format: namespace/name");
    process.exit(2);
  }

  try {
    // Initialize database connection
    logger.debug("Initializing database connection");
    await initializeDatabase();

    // Execute the check
    const result = await executeCheck(namespace, name);

    // Write result to database
    await writeHeartbeat(namespace, name, result);

    // Exit with appropriate status code
    // 0 = healthy, 1 = unhealthy, 2 = error
    if (result.state === "up") {
      logger.info("Check result: healthy");
      process.exit(0);
    } else {
      logger.info(`Check result: ${result.state}`);
      process.exit(1);
    }
  } catch (error) {
    logger.error("Check execution failed:", error);
    process.exit(2);
  }
}

// Run main function
main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(2);
});
