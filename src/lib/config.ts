import { logger } from "./logger";

/**
 * Parse and validate a port string into a valid port number (1–65535).
 * Returns null for empty input (caller applies default). Throws on invalid.
 */
export function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return 3000;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535 || String(parsed) !== raw.trim()) {
    throw new Error(`Invalid PORT "${raw}": must be an integer between 1 and 65535`);
  }
  return parsed;
}

export function parseJobTTLSeconds(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 120;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 60 || parsed > 86400 || String(parsed) !== raw.trim()) {
    throw new Error(`Invalid JOB_TTL_SECONDS "${raw}": must be an integer between 60 and 86400`);
  }
  return parsed;
}

function parseBoundedInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max || String(parsed) !== raw.trim()) {
    throw new Error(`Invalid ${name} "${raw}": must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

/**
 * Load configuration from environment variables.
 * Values are validated eagerly in loadConfig(); callers can use the `config`
 * object directly after a successful validateConfig().
 */
function loadConfig() {
  const kubeNamespace = process.env.KUBE_NAMESPACE || "monitoring";

  return {
    // Server
    port: parsePort(process.env.PORT),
    env: process.env.NODE_ENV || "development",
    isDev: process.env.NODE_ENV !== "production",

    // Kubernetes
    kubeConfig: process.env.KUBECONFIG,
    kubeNamespace,
    jobTTLSeconds: parseJobTTLSeconds(process.env.JOB_TTL_SECONDS),
    executionMode: process.env.EXECUTION_MODE === "jobs" ? ("jobs" as const) : ("sidecar" as const),
    checkerUrl: process.env.CHECKER_URL || "http://127.0.0.1:3001",
    executionConcurrency: parseBoundedInteger(
      process.env.EXECUTION_CONCURRENCY,
      4,
      "EXECUTION_CONCURRENCY",
      1,
      64,
    ),
    executionQueueCapacity: parseBoundedInteger(
      process.env.EXECUTION_QUEUE_CAPACITY,
      256,
      "EXECUTION_QUEUE_CAPACITY",
      1,
      100000,
    ),
    shutdownGraceMs:
      parseBoundedInteger(
        process.env.EXECUTION_SHUTDOWN_GRACE_SECONDS,
        15,
        "EXECUTION_SHUTDOWN_GRACE_SECONDS",
        0,
        3600,
      ) * 1000,

    // Logging
    logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  };
}

export const config = loadConfig();

// Validate required config; throws on failure.
export function validateConfig(): void {
  const errors: string[] = [];

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    errors.push(`port must be an integer between 1 and 65535 (got ${config.port})`);
  }

  if (!config.kubeNamespace || config.kubeNamespace.trim() === "") {
    errors.push("KUBE_NAMESPACE must be a non-empty string");
  }

  if (
    !Number.isInteger(config.jobTTLSeconds) ||
    config.jobTTLSeconds < 60 ||
    config.jobTTLSeconds > 86400
  ) {
    errors.push(
      `jobTTLSeconds must be an integer between 60 and 86400 (got ${config.jobTTLSeconds})`,
    );
  }

  if (errors.length > 0) {
    logger.error("Configuration errors:");
    for (const e of errors) {
      logger.error(`  - ${e}`);
    }
    throw new Error(`Invalid configuration: ${errors.join("; ")}`);
  }

  logger.info(
    {
      env: config.env,
      port: config.port,
      namespace: config.kubeNamespace,
      jobTTLSeconds: config.jobTTLSeconds,
    },
    "Configuration loaded",
  );
}
