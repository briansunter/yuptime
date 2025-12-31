import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRedisMonitor, createRedisMonitorNoTarget } from "../test-utils/fixtures/monitors";
import { createMockRedisClientFactory } from "../test-utils/mocks/database";
import { createCheckRedis } from "./redis";

describe("checkRedis", () => {
  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set password in environment (simulating Job injection)
    process.env.YUPTIME_CRED_REDIS_PASSWORD = "mock-password";
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  test("returns up for successful Redis connection", async () => {
    const checker = createCheckRedis(createMockRedisClientFactory());
    const result = await checker(createRedisMonitor(), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("REDIS_OK");
    expect(result.message).toBe("Redis connection successful");
  });

  test("returns up for successful Redis connection with auth", async () => {
    const checker = createCheckRedis(createMockRedisClientFactory());
    const result = await checker(createRedisMonitor({ secretName: "redis-secret" }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("REDIS_OK");
    expect(result.message).toBe("Redis connection successful");
  });

  test("returns down when no Redis target configured", async () => {
    const checker = createCheckRedis(createMockRedisClientFactory());
    const result = await checker(createRedisMonitorNoTarget(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("INVALID_CONFIG");
    expect(result.message).toBe("No Redis target configured");
  });

  test("returns down for unexpected PING response", async () => {
    const checker = createCheckRedis(createMockRedisClientFactory({ pingResult: "NOT_PONG" }));
    const result = await checker(createRedisMonitor(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("REDIS_UNEXPECTED_RESPONSE");
    expect(result.message).toBe("Unexpected PING response: NOT_PONG");
  });

  // Parameterized error handling tests
  const errorCases = [
    {
      name: "connection refused",
      error: new Error("connect ECONNREFUSED 127.0.0.1:6379"),
      reason: "CONNECTION_REFUSED",
      message: "Redis connection refused",
    },
    {
      name: "timeout",
      error: new Error("Connection timeout"),
      reason: "TIMEOUT",
      message: "Redis connection timeout after 10s",
    },
    {
      name: "authentication failed (NOAUTH)",
      error: new Error("NOAUTH Authentication required"),
      reason: "AUTH_FAILED",
      message: "Redis authentication failed",
    },
    {
      name: "authentication failed (WRONGPASS)",
      error: new Error("WRONGPASS invalid username-password pair"),
      reason: "AUTH_FAILED",
      message: "Redis authentication failed",
    },
    {
      name: "authentication failed (invalid password)",
      error: new Error("ERR invalid password"),
      reason: "AUTH_FAILED",
      message: "Redis authentication failed",
    },
    {
      name: "host not found",
      error: new Error("getaddrinfo ENOTFOUND redis.example.com"),
      reason: "DNS_NXDOMAIN",
      message: "Redis host not found",
    },
    {
      name: "generic error",
      error: new Error("Some other Redis error"),
      reason: "CONNECTION_ERROR",
      message: "Some other Redis error",
    },
  ];

  for (const { name, error, reason, message } of errorCases) {
    test(`returns ${reason} for ${name}`, async () => {
      const checker = createCheckRedis(createMockRedisClientFactory({ connectError: error }));
      const result = await checker(createRedisMonitor(), 10);

      expect(result.state).toBe("down");
      expect(result.reason).toBe(reason);
      expect(result.message).toBe(message);
    });
  }

  test("returns down on ping error", async () => {
    const checker = createCheckRedis(
      createMockRedisClientFactory({ pingError: new Error("Ping failed") }),
    );
    const result = await checker(createRedisMonitor(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("CONNECTION_ERROR");
    expect(result.message).toBe("Ping failed");
  });

  test("handles custom port", async () => {
    const checker = createCheckRedis(createMockRedisClientFactory());
    const result = await checker(createRedisMonitor({ port: 6380 }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("REDIS_OK");
  });

  test("handles custom database", async () => {
    const checker = createCheckRedis(createMockRedisClientFactory());
    const result = await checker(createRedisMonitor({ database: 5 }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("REDIS_OK");
  });

  test("handles TLS enabled", async () => {
    const checker = createCheckRedis(createMockRedisClientFactory());
    const result = await checker(createRedisMonitor({ tlsEnabled: true }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("REDIS_OK");
  });

  test("includes latency in result", async () => {
    const checker = createCheckRedis(createMockRedisClientFactory());
    const result = await checker(createRedisMonitor(), 10);

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("handles quit() errors gracefully", async () => {
    const checker = createCheckRedis(
      createMockRedisClientFactory({ quitError: new Error("Close error") }),
    );
    const result = await checker(createRedisMonitor(), 10);

    // Should still return up since connection and ping succeeded
    expect(result.state).toBe("up");
    expect(result.reason).toBe("REDIS_OK");
  });

  test("works without credentials secret", async () => {
    // Redis monitor without credentialsSecretRef
    const checker = createCheckRedis(createMockRedisClientFactory());
    const result = await checker(createRedisMonitor(), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("REDIS_OK");
  });

  test("returns down when credentials required but not in environment", async () => {
    // Clear password from environment
    delete process.env.YUPTIME_CRED_REDIS_PASSWORD;

    const checker = createCheckRedis(createMockRedisClientFactory());
    // Use monitor with secretName (which enables credentialsSecretRef)
    const result = await checker(createRedisMonitor({ secretName: "redis-secret" }), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("CREDENTIALS_ERROR");
    expect(result.message).toBe("Redis password not found in environment");
  });
});
