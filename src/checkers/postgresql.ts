import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

/**
 * Get PostgreSQL credentials from environment variables.
 * These are injected by the Job builder from Kubernetes secrets.
 */
function getCredentialsFromEnv(): { username: string; password: string } | null {
  const username = process.env.YUPTIME_CRED_POSTGRESQL_USERNAME;
  const password = process.env.YUPTIME_CRED_POSTGRESQL_PASSWORD;

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

/**
 * PostgreSQL client interface for dependency injection
 */
export interface PostgreSqlClient {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
}

/**
 * PostgreSQL client factory configuration
 */
export interface PostgreSqlClientConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionTimeoutMillis: number;
  ssl?:
    | {
        rejectUnauthorized: boolean;
      }
    | boolean;
}

/**
 * PostgreSQL client factory type for dependency injection
 */
export type PostgreSqlClientFactory = (config: PostgreSqlClientConfig) => Promise<PostgreSqlClient>;

/**
 * Default PostgreSQL client factory using pg
 * Note: This requires the pg package to be installed
 */
async function createDefaultPostgreSqlClient(
  config: PostgreSqlClientConfig,
): Promise<PostgreSqlClient> {
  // Use dynamic import to avoid bundling pg if not used
  const { Client } = await import("pg");

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    ssl: config.ssl,
  });

  return {
    connect: async () => {
      await client.connect();
    },
    query: async (sql: string) => {
      const result = await client.query(sql);
      return result.rows;
    },
    end: async () => {
      await client.end();
    },
  };
}

/**
 * Map SSL mode to pg ssl configuration
 */
function mapSslMode(
  sslMode: string | undefined,
): { rejectUnauthorized: boolean } | boolean | undefined {
  switch (sslMode) {
    case "disable":
      return false;
    case "require":
      return { rejectUnauthorized: false };
    case "verify-ca":
    case "verify-full":
      return { rejectUnauthorized: true };
    default:
      return undefined; // Let pg decide (covers 'prefer' and undefined)
  }
}

/**
 * Internal PostgreSQL checker implementation with injectable client factory
 */
async function checkPostgreSqlWithFactory(
  monitor: Monitor,
  timeout: number,
  clientFactory: (config: PostgreSqlClientConfig) => Promise<PostgreSqlClient>,
): Promise<CheckResult> {
  const target = monitor.spec.target.postgresql;

  if (!target) {
    return {
      state: "down",
      latencyMs: 0,
      reason: "INVALID_CONFIG",
      message: "No PostgreSQL target configured",
    };
  }

  const startTime = Date.now();

  try {
    // Get credentials from environment variables (injected by Job builder)
    const credentials = getCredentialsFromEnv();

    if (!credentials) {
      return {
        state: "down",
        latencyMs: Date.now() - startTime,
        reason: "CREDENTIALS_ERROR",
        message: "PostgreSQL credentials not found in environment",
      };
    }

    const client = await clientFactory({
      host: target.host,
      port: target.port ?? 5432,
      user: credentials.username,
      password: credentials.password,
      database: target.database ?? "postgres",
      connectionTimeoutMillis: timeout * 1000,
      ssl: mapSslMode(target.sslMode),
    });

    try {
      await client.connect();
      const healthQuery = target.healthQuery ?? "SELECT 1";
      await client.query(healthQuery);

      const latencyMs = Date.now() - startTime;

      return {
        state: "up",
        latencyMs,
        reason: "POSTGRESQL_OK",
        message: "PostgreSQL connection successful",
      };
    } finally {
      await client.end().catch(() => {
        // Ignore close errors
      });
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logger.warn({ monitor: monitor.metadata.name, error: errorMessage }, "PostgreSQL check failed");

    // Categorize common PostgreSQL errors
    if (errorMessage.includes("ECONNREFUSED")) {
      return {
        state: "down",
        latencyMs,
        reason: "CONNECTION_REFUSED",
        message: "PostgreSQL connection refused",
      };
    }

    if (errorMessage.includes("ETIMEDOUT") || errorMessage.includes("timeout")) {
      return {
        state: "down",
        latencyMs,
        reason: "TIMEOUT",
        message: `PostgreSQL connection timeout after ${timeout}s`,
      };
    }

    if (
      errorMessage.includes("password authentication failed") ||
      errorMessage.includes("authentication failed")
    ) {
      return {
        state: "down",
        latencyMs,
        reason: "AUTH_FAILED",
        message: "PostgreSQL authentication failed",
      };
    }

    if (errorMessage.includes("ENOTFOUND")) {
      return {
        state: "down",
        latencyMs,
        reason: "DNS_NXDOMAIN",
        message: "PostgreSQL host not found",
      };
    }

    if (errorMessage.includes("does not exist")) {
      return {
        state: "down",
        latencyMs,
        reason: "DATABASE_NOT_FOUND",
        message: "PostgreSQL database not found",
      };
    }

    return {
      state: "down",
      latencyMs,
      reason: "CONNECTION_ERROR",
      message: errorMessage,
    };
  }
}

/**
 * PostgreSQL health checker
 */
export async function checkPostgreSql(monitor: Monitor, timeout: number): Promise<CheckResult> {
  return checkPostgreSqlWithFactory(monitor, timeout, createDefaultPostgreSqlClient);
}

/**
 * Create a PostgreSQL checker with a custom client factory (for testing)
 */
export function createCheckPostgreSql(
  clientFactory: (config: PostgreSqlClientConfig) => Promise<PostgreSqlClient>,
): (monitor: Monitor, timeout: number) => Promise<CheckResult> {
  return (monitor: Monitor, timeout: number) =>
    checkPostgreSqlWithFactory(monitor, timeout, clientFactory);
}
