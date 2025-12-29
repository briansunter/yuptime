import { logger } from "./logger";

// Load environment variables
export const config = {
  // Server
  port: parseInt(process.env.PORT || "3000", 10),
  env: process.env.NODE_ENV || "development",
  isDev: process.env.NODE_ENV !== "production",

  // Kubernetes
  kubeConfig: process.env.KUBECONFIG,
  kubeNamespace: process.env.KUBE_NAMESPACE || "monitoring",

  // Logging
  logLevel:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
};

// Validate required config
export function validateConfig(): void {
  const errors: string[] = [];

  if (errors.length > 0) {
    logger.error("Configuration errors:");
    for (const e of errors) {
      logger.error(`  - ${e}`);
    }
    throw new Error("Invalid configuration");
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

export default config;
