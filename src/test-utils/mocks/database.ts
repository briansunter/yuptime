/**
 * Mock database and gRPC client factories for testing
 */

import type { GrpcClientConfig, GrpcHealthClient } from "../../checkers/grpc";
import type { MySqlClient, MySqlClientConfig } from "../../checkers/mysql";
import type { PostgreSqlClient, PostgreSqlClientConfig } from "../../checkers/postgresql";
import type { RedisClient, RedisClientConfig } from "../../checkers/redis";

/**
 * Mock MySQL client result
 */
export interface MockMySqlResult {
  queryResult?: unknown;
  connectError?: Error;
  queryError?: Error;
  endError?: Error;
}

/**
 * Creates a mock MySQL client factory for testing
 */
export function createMockMySqlClientFactory(
  result: MockMySqlResult = {},
): (config: MySqlClientConfig) => Promise<MySqlClient> {
  return async (_config: MySqlClientConfig) => {
    return {
      connect: async () => {
        if (result.connectError) {
          throw result.connectError;
        }
      },
      query: async (_sql: string) => {
        if (result.queryError) {
          throw result.queryError;
        }
        return result.queryResult ?? [{ result: 1 }];
      },
      end: async () => {
        if (result.endError) {
          throw result.endError;
        }
      },
    };
  };
}

/**
 * Mock PostgreSQL client result
 */
export interface MockPostgreSqlResult {
  queryResult?: unknown;
  connectError?: Error;
  queryError?: Error;
  endError?: Error;
}

/**
 * Creates a mock PostgreSQL client factory for testing
 */
export function createMockPostgreSqlClientFactory(
  result: MockPostgreSqlResult = {},
): (config: PostgreSqlClientConfig) => Promise<PostgreSqlClient> {
  return async (_config: PostgreSqlClientConfig) => {
    return {
      connect: async () => {
        if (result.connectError) {
          throw result.connectError;
        }
      },
      query: async (_sql: string) => {
        if (result.queryError) {
          throw result.queryError;
        }
        return result.queryResult ?? [{ result: 1 }];
      },
      end: async () => {
        if (result.endError) {
          throw result.endError;
        }
      },
    };
  };
}

/**
 * Mock Redis client result
 */
export interface MockRedisResult {
  pingResult?: string;
  connectError?: Error;
  pingError?: Error;
  quitError?: Error;
}

/**
 * Creates a mock Redis client factory for testing
 */
export function createMockRedisClientFactory(
  result: MockRedisResult = {},
): (config: RedisClientConfig) => Promise<RedisClient> {
  return async (_config: RedisClientConfig) => {
    return {
      connect: async () => {
        if (result.connectError) {
          throw result.connectError;
        }
      },
      ping: async () => {
        if (result.pingError) {
          throw result.pingError;
        }
        return result.pingResult ?? "PONG";
      },
      quit: async () => {
        if (result.quitError) {
          throw result.quitError;
        }
      },
    };
  };
}

/**
 * Mock gRPC client result
 */
export interface MockGrpcResult {
  checkStatus?: number;
  checkError?: Error & { code?: number };
}

/**
 * Creates a mock gRPC health client factory for testing
 */
export function createMockGrpcClientFactory(
  result: MockGrpcResult = {},
): (config: GrpcClientConfig) => Promise<GrpcHealthClient> {
  return async (_config: GrpcClientConfig) => {
    return {
      check: async (_request: { service: string }) => {
        if (result.checkError) {
          throw result.checkError;
        }
        return { status: result.checkStatus ?? 1 }; // Default to SERVING
      },
      close: () => {
        // No-op
      },
    };
  };
}

/**
 * Create a gRPC error with a specific code
 */
export function createGrpcError(message: string, code: number): Error & { code: number } {
  const error = new Error(message) as Error & { code: number };
  error.code = code;
  return error;
}
