import { logger } from "../lib/logger";
import { resolveSecretCached } from "../lib/secrets";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

/**
 * MySQL client interface for dependency injection
 */
export interface MySqlClient {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
}

/**
 * MySQL client factory configuration
 */
export interface MySqlClientConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
  connectTimeout: number;
}

/**
 * MySQL client factory type for dependency injection
 */
export type MySqlClientFactory = (config: MySqlClientConfig) => MySqlClient;

/**
 * Default MySQL client factory using mysql2
 * Note: This requires the mysql2 package to be installed
 */
async function createDefaultMySqlClient(config: MySqlClientConfig): Promise<MySqlClient> {
  // Use dynamic import to avoid bundling mysql2 if not used
  const mysql2 = await import("mysql2/promise");

  const connection = await mysql2.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: config.connectTimeout,
  });

  return {
    connect: async () => {
      // Connection is already established by createConnection
    },
    query: async (sql: string) => {
      const [rows] = await connection.execute(sql);
      return rows;
    },
    end: async () => {
      await connection.end();
    },
  };
}

/**
 * Internal MySQL checker implementation with injectable client factory
 */
async function checkMySqlWithFactory(
  monitor: Monitor,
  timeout: number,
  clientFactory: (config: MySqlClientConfig) => Promise<MySqlClient>,
): Promise<CheckResult> {
  const target = monitor.spec.target.mysql;

  if (!target) {
    return {
      state: "down",
      latencyMs: 0,
      reason: "INVALID_CONFIG",
      message: "No MySQL target configured",
    };
  }

  const startTime = Date.now();

  try {
    // Resolve credentials from Kubernetes Secret
    const namespace = monitor.metadata.namespace;
    const secretName = target.credentialsSecretRef.name;
    const usernameKey = target.credentialsSecretRef.usernameKey ?? "username";
    const passwordKey = target.credentialsSecretRef.passwordKey ?? "password";

    const [username, password] = await Promise.all([
      resolveSecretCached(namespace, secretName, usernameKey),
      resolveSecretCached(namespace, secretName, passwordKey),
    ]);

    if (!username || !password) {
      return {
        state: "down",
        latencyMs: Date.now() - startTime,
        reason: "CREDENTIALS_ERROR",
        message: "Failed to resolve database credentials from secret",
      };
    }

    const client = await clientFactory({
      host: target.host,
      port: target.port ?? 3306,
      user: username,
      password: password,
      database: target.database,
      connectTimeout: timeout * 1000,
    });

    try {
      await client.connect();
      const healthQuery = target.healthQuery ?? "SELECT 1";
      await client.query(healthQuery);

      const latencyMs = Date.now() - startTime;

      return {
        state: "up",
        latencyMs,
        reason: "MYSQL_OK",
        message: "MySQL connection successful",
      };
    } finally {
      await client.end().catch(() => {
        // Ignore close errors
      });
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logger.warn({ monitor: monitor.metadata.name, error: errorMessage }, "MySQL check failed");

    // Categorize common MySQL errors
    if (errorMessage.includes("ECONNREFUSED")) {
      return {
        state: "down",
        latencyMs,
        reason: "CONNECTION_REFUSED",
        message: "MySQL connection refused",
      };
    }

    if (errorMessage.includes("ETIMEDOUT") || errorMessage.includes("timeout")) {
      return {
        state: "down",
        latencyMs,
        reason: "TIMEOUT",
        message: `MySQL connection timeout after ${timeout}s`,
      };
    }

    if (errorMessage.includes("Access denied") || errorMessage.includes("ER_ACCESS_DENIED")) {
      return {
        state: "down",
        latencyMs,
        reason: "AUTH_FAILED",
        message: "MySQL authentication failed",
      };
    }

    if (errorMessage.includes("ENOTFOUND")) {
      return {
        state: "down",
        latencyMs,
        reason: "DNS_NXDOMAIN",
        message: "MySQL host not found",
      };
    }

    if (errorMessage.includes("Unknown database")) {
      return {
        state: "down",
        latencyMs,
        reason: "DATABASE_NOT_FOUND",
        message: "MySQL database not found",
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
 * MySQL health checker
 */
export async function checkMySql(monitor: Monitor, timeout: number): Promise<CheckResult> {
  return checkMySqlWithFactory(monitor, timeout, createDefaultMySqlClient);
}

/**
 * Create a MySQL checker with a custom client factory (for testing)
 */
export function createCheckMySql(
  clientFactory: (config: MySqlClientConfig) => Promise<MySqlClient>,
): (monitor: Monitor, timeout: number) => Promise<CheckResult> {
  return (monitor: Monitor, timeout: number) =>
    checkMySqlWithFactory(monitor, timeout, clientFactory);
}
