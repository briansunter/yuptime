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
    },
    "Configuration loaded",
  );
}
