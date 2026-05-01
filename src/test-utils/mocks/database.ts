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
  return (_config: MySqlClientConfig) =>
    Promise.resolve({
      connect: () =>
        result.connectError ? Promise.reject(result.connectError) : Promise.resolve(),
      query: (_sql: string) =>
        result.queryError
          ? Promise.reject(result.queryError)
          : Promise.resolve(result.queryResult ?? [{ result: 1 }]),
      end: () => (result.endError ? Promise.reject(result.endError) : Promise.resolve()),
    });
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
  return (_config: PostgreSqlClientConfig) =>
    Promise.resolve({
      connect: () =>
        result.connectError ? Promise.reject(result.connectError) : Promise.resolve(),
      query: (_sql: string) =>
        result.queryError
          ? Promise.reject(result.queryError)
          : Promise.resolve(result.queryResult ?? [{ result: 1 }]),
      end: () => (result.endError ? Promise.reject(result.endError) : Promise.resolve()),
    });
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
  return (_config: RedisClientConfig) =>
    Promise.resolve({
      connect: () =>
        result.connectError ? Promise.reject(result.connectError) : Promise.resolve(),
      ping: () =>
        result.pingError
          ? Promise.reject(result.pingError)
          : Promise.resolve(result.pingResult ?? "PONG"),
      quit: () => (result.quitError ? Promise.reject(result.quitError) : Promise.resolve()),
    });
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
  return (_config: GrpcClientConfig) =>
    Promise.resolve({
      check: (_request: { service: string }) =>
        result.checkError
          ? Promise.reject(result.checkError)
          : Promise.resolve({ status: result.checkStatus ?? 1 }),
      close: () => {
        // No-op
      },
    });
}

/**
 * Create a gRPC error with a specific code
 */
export function createGrpcError(message: string, code: number): Error & { code: number } {
  const error = new Error(message) as Error & { code: number };
  error.code = code;
  return error;
}
