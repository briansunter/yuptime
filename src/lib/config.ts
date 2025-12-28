import { logger } from "./logger";

// Determine database type from environment
const getDbType = () => {
  if (process.env.ETCD_ENDPOINTS) return "etcd";
  if ((process.env.DATABASE_URL || "").startsWith("postgresql://")) return "postgresql";
  return "sqlite";
};

// Load environment variables
export const config = {
  // Server
  port: parseInt(process.env.PORT || "3000", 10),
  env: process.env.NODE_ENV || "development",
  isDev: process.env.NODE_ENV !== "production",

  // Database
  databaseUrl: process.env.DATABASE_URL || "sqlite:./kubekuma.db",
  isPostgres: (process.env.DATABASE_URL || "").startsWith("postgresql://"),
  isEtcd: !!process.env.ETCD_ENDPOINTS,
  dbType: getDbType(),
  etcdEndpoints: process.env.ETCD_ENDPOINTS,

  // Kubernetes
  kubeConfig: process.env.KUBECONFIG,
  kubeNamespace: process.env.KUBE_NAMESPACE || "monitoring",

  // Auth
  authMode: (process.env.AUTH_MODE || "local") as "oidc" | "local" | "disabled",
  oidcIssuerUrl: process.env.OIDC_ISSUER_URL,
  oidcClientId: process.env.OIDC_CLIENT_ID,
  oidcClientSecret: process.env.OIDC_CLIENT_SECRET,
  oidcRedirectUrl: process.env.OIDC_REDIRECT_URL,

  // Session
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
  sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || "604800", 10), // 7 days

  // Logging
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
};

// Validate required config
export function validateConfig(): void {
  const errors: string[] = [];

  if (config.authMode === "oidc") {
    if (!config.oidcIssuerUrl) errors.push("OIDC_ISSUER_URL required when AUTH_MODE=oidc");
    if (!config.oidcClientId) errors.push("OIDC_CLIENT_ID required when AUTH_MODE=oidc");
    if (!config.oidcClientSecret) errors.push("OIDC_CLIENT_SECRET required when AUTH_MODE=oidc");
    if (!config.oidcRedirectUrl) errors.push("OIDC_REDIRECT_URL required when AUTH_MODE=oidc");
  }

  if (config.isDev && config.sessionSecret === "dev-secret-change-in-production") {
    logger.warn("Using default session secret in development. Change SESSION_SECRET in production.");
  }

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
      database: config.dbType === "etcd" ? "etcd" : config.isPostgres ? "PostgreSQL" : "SQLite",
      auth: config.authMode,
    },
    "Configuration loaded"
  );
}

export default config;
