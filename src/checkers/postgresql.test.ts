import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createPostgreSqlMonitor,
  createPostgreSqlMonitorNoTarget,
} from "../test-utils/fixtures/monitors";
import { createMockPostgreSqlClientFactory } from "../test-utils/mocks/database";
import { createCheckPostgreSql } from "./postgresql";

describe("checkPostgreSql", () => {
  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set credentials in environment (simulating Job injection)
    process.env.YUPTIME_CRED_POSTGRESQL_USERNAME = "testuser";
    process.env.YUPTIME_CRED_POSTGRESQL_PASSWORD = "testpass";
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  test("returns up for successful PostgreSQL connection", async () => {
    const checker = createCheckPostgreSql(createMockPostgreSqlClientFactory());
    const result = await checker(createPostgreSqlMonitor(), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("POSTGRESQL_OK");
    expect(result.message).toBe("PostgreSQL connection successful");
  });

  test("returns up with custom health query", async () => {
    const checker = createCheckPostgreSql(createMockPostgreSqlClientFactory());
    const result = await checker(createPostgreSqlMonitor({ healthQuery: "SELECT NOW()" }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("POSTGRESQL_OK");
  });

  test("returns down when no PostgreSQL target configured", async () => {
    const checker = createCheckPostgreSql(createMockPostgreSqlClientFactory());
    const result = await checker(createPostgreSqlMonitorNoTarget(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("INVALID_CONFIG");
    expect(result.message).toBe("No PostgreSQL target configured");
  });

  test("returns down when credentials not in environment", async () => {
    // Clear credentials from environment
    delete process.env.YUPTIME_CRED_POSTGRESQL_USERNAME;
    delete process.env.YUPTIME_CRED_POSTGRESQL_PASSWORD;

    const checker = createCheckPostgreSql(createMockPostgreSqlClientFactory());
    const result = await checker(createPostgreSqlMonitor(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("CREDENTIALS_ERROR");
    expect(result.message).toBe("PostgreSQL credentials not found in environment");
  });

  // Parameterized error handling tests
  const errorCases = [
    {
      name: "connection refused",
      error: new Error("connect ECONNREFUSED 127.0.0.1:5432"),
      reason: "CONNECTION_REFUSED",
      message: "PostgreSQL connection refused",
    },
    {
      name: "timeout",
      error: new Error("Connection timeout"),
      reason: "TIMEOUT",
      message: "PostgreSQL connection timeout after 10s",
    },
    {
      name: "authentication failed",
      error: new Error("password authentication failed for user"),
      reason: "AUTH_FAILED",
      message: "PostgreSQL authentication failed",
    },
    {
      name: "host not found",
      error: new Error("getaddrinfo ENOTFOUND postgres.example.com"),
      reason: "DNS_NXDOMAIN",
      message: "PostgreSQL host not found",
    },
    {
      name: "database not found",
      error: new Error('database "nonexistent" does not exist'),
      reason: "DATABASE_NOT_FOUND",
      message: "PostgreSQL database not found",
    },
    {
      name: "generic error",
      error: new Error("Some other PostgreSQL error"),
      reason: "CONNECTION_ERROR",
      message: "Some other PostgreSQL error",
    },
  ];

  for (const { name, error, reason, message } of errorCases) {
    test(`returns ${reason} for ${name}`, async () => {
      const checker = createCheckPostgreSql(
        createMockPostgreSqlClientFactory({ connectError: error }),
      );
      const result = await checker(createPostgreSqlMonitor(), 10);

      expect(result.state).toBe("down");
      expect(result.reason).toBe(reason);
      expect(result.message).toBe(message);
    });
  }

  test("returns down on query error", async () => {
    const checker = createCheckPostgreSql(
      createMockPostgreSqlClientFactory({ queryError: new Error("Query execution failed") }),
    );
    const result = await checker(createPostgreSqlMonitor(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("CONNECTION_ERROR");
    expect(result.message).toBe("Query execution failed");
  });

  test("handles custom port", async () => {
    const checker = createCheckPostgreSql(createMockPostgreSqlClientFactory());
    const result = await checker(createPostgreSqlMonitor({ port: 5433 }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("POSTGRESQL_OK");
  });

  test("handles custom database", async () => {
    const checker = createCheckPostgreSql(createMockPostgreSqlClientFactory());
    const result = await checker(createPostgreSqlMonitor({ database: "myapp" }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("POSTGRESQL_OK");
  });

  // SSL mode tests
  const sslModes: Array<"disable" | "require" | "verify-ca" | "verify-full"> = [
    "disable",
    "require",
    "verify-ca",
    "verify-full",
  ];

  for (const sslMode of sslModes) {
    test(`handles sslMode=${sslMode}`, async () => {
      const checker = createCheckPostgreSql(createMockPostgreSqlClientFactory());
      const result = await checker(createPostgreSqlMonitor({ sslMode }), 10);

      expect(result.state).toBe("up");
      expect(result.reason).toBe("POSTGRESQL_OK");
    });
  }

  test("includes latency in result", async () => {
    const checker = createCheckPostgreSql(createMockPostgreSqlClientFactory());
    const result = await checker(createPostgreSqlMonitor(), 10);

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("handles end() errors gracefully", async () => {
    const checker = createCheckPostgreSql(
      createMockPostgreSqlClientFactory({ endError: new Error("Close error") }),
    );
    const result = await checker(createPostgreSqlMonitor(), 10);

    // Should still return up since connection and query succeeded
    expect(result.state).toBe("up");
    expect(result.reason).toBe("POSTGRESQL_OK");
  });
});
