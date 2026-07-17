#!/usr/bin/env bun
/**
 * Checker Executor CLI
 * Entry point for Job pods to execute monitor checks
 * Returns structured results to the controller in rollback Job mode. The
 * legacy direct-status path remains available only for manual compatibility.
 *
 * Usage:
 *   checker-executor --monitor namespace/name
 */

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { executeCheck, updateMonitorStatus } from "./executor";

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
      "runner-result": { type: "boolean", default: false },
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
    const startedAt = new Date().toISOString();
    // Execute the check
    const result = await executeCheck(namespace, name);

    if (values["runner-result"]) {
      writeFileSync(
        "/dev/termination-log",
        JSON.stringify({
          ...result,
          executionId: process.env.EXECUTION_ID,
          attempt: Number.parseInt(process.env.ATTEMPT ?? "1", 10),
          startedAt,
          checkedAt: new Date().toISOString(),
        }),
      );
      process.exit(0);
    }

    // Update Monitor CRD status
    await updateMonitorStatus(namespace, name, result);

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
    if (values["runner-result"]) {
      const now = new Date().toISOString();
      writeFileSync(
        "/dev/termination-log",
        JSON.stringify({
          executionId: process.env.EXECUTION_ID ?? "unknown",
          attempt: Number.parseInt(process.env.ATTEMPT ?? "1", 10),
          startedAt: now,
          checkedAt: now,
          state: "down",
          latencyMs: 0,
          reason: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message.slice(0, 4096) : "Check failed",
        }),
      );
      process.exit(0);
    }
    logger.error("Check execution failed:", error);
    process.exit(2);
  }
}

// Run main function
main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(2);
});
