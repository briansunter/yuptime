import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

/**
 * Get Redis password from environment variables.
 * These are injected by the Job builder from Kubernetes secrets.
 */
function getPasswordFromEnv(): string | undefined {
  return process.env.YUPTIME_CRED_REDIS_PASSWORD;
}

/**
 * Redis client interface for dependency injection
 */
export interface RedisClient {
  connect(): Promise<void>;
  ping(): Promise<string>;
  quit(): Promise<void>;
}

/**
 * Redis client factory configuration
 */
export interface RedisClientConfig {
  host: string;
  port: number;
  password?: string;
  database: number;
  connectTimeout: number;
  tls?: boolean;
}

/**
 * Redis client factory type for dependency injection
 */
export type RedisClientFactory = (config: RedisClientConfig) => Promise<RedisClient>;

/**
 * Default Redis client factory using redis package
 * Note: This requires the redis package to be installed
 */
async function createDefaultRedisClient(config: RedisClientConfig): Promise<RedisClient> {
  // Use dynamic import to avoid bundling redis if not used
  const redis = await import("redis");

  // biome-ignore lint/suspicious/noExplicitAny: redis client type complexity
  const clientOptions: any = {
    socket: {
      host: config.host,
      port: config.port,
      connectTimeout: config.connectTimeout,
      // Disable reconnection - we want a single connection attempt for health checks
      reconnectStrategy: false,
    },
    password: config.password,
    database: config.database,
  };

  // Only add TLS if enabled
  if (config.tls) {
    clientOptions.socket.tls = true;
  }

  const client = redis.createClient(clientOptions);

  return {
    connect: async () => {
      await client.connect();
    },
    ping: async () => {
      return await client.ping();
    },
    quit: async () => {
      await client.quit();
    },
  };
}

/**
 * Internal Redis checker implementation with injectable client factory
 */
async function checkRedisWithFactory(
  monitor: Monitor,
  timeout: number,
  clientFactory: (config: RedisClientConfig) => Promise<RedisClient>,
): Promise<CheckResult> {
  const target = monitor.spec.target.redis;

  if (!target) {
    return {
      state: "down",
      latencyMs: 0,
      reason: "INVALID_CONFIG",
      message: "No Redis target configured",
    };
  }

  const startTime = Date.now();

  try {
    // Get password from environment variables (injected by Job builder)
    // Only check env if credentialsSecretRef was defined in the Monitor spec
    const password = target.credentialsSecretRef ? getPasswordFromEnv() : undefined;

    // If secret ref was defined but password is missing, return error
    if (target.credentialsSecretRef && !password) {
      return {
        state: "down",
        latencyMs: Date.now() - startTime,
        reason: "CREDENTIALS_ERROR",
        message: "Redis password not found in environment",
      };
    }

    const client = await clientFactory({
      host: target.host,
      port: target.port ?? 6379,
      password: password,
      database: target.database ?? 0,
      connectTimeout: timeout * 1000,
      tls: target.tls?.enabled,
    });

    try {
      await client.connect();
      const pong = await client.ping();

      const latencyMs = Date.now() - startTime;

      if (pong === "PONG") {
        return {
          state: "up",
          latencyMs,
          reason: "REDIS_OK",
          message: "Redis connection successful",
        };
      }

      return {
        state: "down",
        latencyMs,
        reason: "REDIS_UNEXPECTED_RESPONSE",
        message: `Unexpected PING response: ${pong}`,
      };
    } finally {
      await client.quit().catch(() => {
        // Ignore close errors
      });
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    // Redis client may return AggregateError with code but empty message
    const errorCode = (error as { code?: string }).code ?? "";

    logger.warn(
      { monitor: monitor.metadata.name, error: errorMessage || errorCode },
      "Redis check failed",
    );

    // Categorize common Redis errors (check both message and code)
    if (errorMessage.includes("ECONNREFUSED") || errorCode === "ECONNREFUSED") {
      return {
        state: "down",
        latencyMs,
        reason: "CONNECTION_REFUSED",
        message: "Redis connection refused",
      };
    }

    if (
      errorMessage.includes("ETIMEDOUT") ||
      errorMessage.includes("timeout") ||
      errorCode === "ETIMEDOUT"
    ) {
      return {
        state: "down",
        latencyMs,
        reason: "TIMEOUT",
        message: `Redis connection timeout after ${timeout}s`,
      };
    }

    if (
      errorMessage.includes("NOAUTH") ||
      errorMessage.includes("WRONGPASS") ||
      errorMessage.includes("ERR invalid password")
    ) {
      return {
        state: "down",
        latencyMs,
        reason: "AUTH_FAILED",
        message: "Redis authentication failed",
      };
    }

    if (errorMessage.includes("ENOTFOUND") || errorCode === "ENOTFOUND") {
      return {
        state: "down",
        latencyMs,
        reason: "DNS_NXDOMAIN",
        message: "Redis host not found",
      };
    }

    return {
      state: "down",
      latencyMs,
      reason: "CONNECTION_ERROR",
      message: errorMessage || errorCode || "Unknown connection error",
    };
  }
}

/**
 * Redis health checker
 */
export async function checkRedis(monitor: Monitor, timeout: number): Promise<CheckResult> {
  return checkRedisWithFactory(monitor, timeout, createDefaultRedisClient);
}

/**
 * Create a Redis checker with a custom client factory (for testing)
 */
export function createCheckRedis(
  clientFactory: (config: RedisClientConfig) => Promise<RedisClient>,
): (monitor: Monitor, timeout: number) => Promise<CheckResult> {
  return (monitor: Monitor, timeout: number) =>
    checkRedisWithFactory(monitor, timeout, clientFactory);
}
