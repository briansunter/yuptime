import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMySqlMonitor, createMySqlMonitorNoTarget } from "../test-utils/fixtures/monitors";
import { createMockMySqlClientFactory } from "../test-utils/mocks/database";
import { createCheckMySql } from "./mysql";

describe("checkMySql", () => {
  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set credentials in environment (simulating Job injection)
    process.env.YUPTIME_CRED_MYSQL_USERNAME = "testuser";
    process.env.YUPTIME_CRED_MYSQL_PASSWORD = "testpass";
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  test("returns up for successful MySQL connection", async () => {
    const checker = createCheckMySql(createMockMySqlClientFactory());
    const result = await checker(createMySqlMonitor(), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("MYSQL_OK");
    expect(result.message).toBe("MySQL connection successful");
  });

  test("returns up with custom health query", async () => {
    const checker = createCheckMySql(createMockMySqlClientFactory());
    const result = await checker(createMySqlMonitor({ healthQuery: "SELECT NOW()" }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("MYSQL_OK");
  });

  test("returns down when no MySQL target configured", async () => {
    const checker = createCheckMySql(createMockMySqlClientFactory());
    const result = await checker(createMySqlMonitorNoTarget(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("INVALID_CONFIG");
    expect(result.message).toBe("No MySQL target configured");
  });

  test("returns down when credentials not in environment", async () => {
    // Clear credentials from environment
    delete process.env.YUPTIME_CRED_MYSQL_USERNAME;
    delete process.env.YUPTIME_CRED_MYSQL_PASSWORD;

    const checker = createCheckMySql(createMockMySqlClientFactory());
    const result = await checker(createMySqlMonitor(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("CREDENTIALS_ERROR");
    expect(result.message).toBe("MySQL credentials not found in environment");
  });

  // Parameterized error handling tests
  const errorCases = [
    {
      name: "connection refused",
      error: new Error("connect ECONNREFUSED 127.0.0.1:3306"),
      reason: "CONNECTION_REFUSED",
      message: "MySQL connection refused",
    },
    {
      name: "timeout",
      error: new Error("Connection timeout"),
      reason: "TIMEOUT",
      message: "MySQL connection timeout after 10s",
    },
    {
      name: "authentication failed",
      error: new Error("ER_ACCESS_DENIED_ERROR: Access denied for user"),
      reason: "AUTH_FAILED",
      message: "MySQL authentication failed",
    },
    {
      name: "host not found",
      error: new Error("getaddrinfo ENOTFOUND mysql.example.com"),
      reason: "DNS_NXDOMAIN",
      message: "MySQL host not found",
    },
    {
      name: "database not found",
      error: new Error("Unknown database 'nonexistent'"),
      reason: "DATABASE_NOT_FOUND",
      message: "MySQL database not found",
    },
    {
      name: "generic error",
      error: new Error("Some other MySQL error"),
      reason: "CONNECTION_ERROR",
      message: "Some other MySQL error",
    },
  ];

  for (const { name, error, reason, message } of errorCases) {
    test(`returns ${reason} for ${name}`, async () => {
      const checker = createCheckMySql(createMockMySqlClientFactory({ connectError: error }));
      const result = await checker(createMySqlMonitor(), 10);

      expect(result.state).toBe("down");
      expect(result.reason).toBe(reason);
      expect(result.message).toBe(message);
    });
  }

  test("returns down on query error", async () => {
    const checker = createCheckMySql(
      createMockMySqlClientFactory({ queryError: new Error("Query execution failed") }),
    );
    const result = await checker(createMySqlMonitor(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("CONNECTION_ERROR");
    expect(result.message).toBe("Query execution failed");
  });

  test("handles custom port", async () => {
    const checker = createCheckMySql(createMockMySqlClientFactory());
    const result = await checker(createMySqlMonitor({ port: 3307 }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("MYSQL_OK");
  });

  test("handles custom database", async () => {
    const checker = createCheckMySql(createMockMySqlClientFactory());
    const result = await checker(createMySqlMonitor({ database: "myapp" }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("MYSQL_OK");
  });

  test("includes latency in result", async () => {
    const checker = createCheckMySql(createMockMySqlClientFactory());
    const result = await checker(createMySqlMonitor(), 10);

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("handles end() errors gracefully", async () => {
    const checker = createCheckMySql(
      createMockMySqlClientFactory({ endError: new Error("Close error") }),
    );
    const result = await checker(createMySqlMonitor(), 10);

    // Should still return up since connection and query succeeded
    expect(result.state).toBe("up");
    expect(result.reason).toBe("MYSQL_OK");
  });

  test("handles TLS enabled", async () => {
    const checker = createCheckMySql(createMockMySqlClientFactory());
    const monitor = {
      ...createMySqlMonitor(),
      spec: {
        ...createMySqlMonitor().spec,
        target: {
          mysql: {
            ...createMySqlMonitor().spec.target.mysql,
            tls: { enabled: true, verify: true },
          },
        },
      },
    };
    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("MYSQL_OK");
  });

  test("handles TLS with verification disabled", async () => {
    const checker = createCheckMySql(createMockMySqlClientFactory());
    const monitor = {
      ...createMySqlMonitor(),
      spec: {
        ...createMySqlMonitor().spec,
        target: {
          mysql: {
            ...createMySqlMonitor().spec.target.mysql,
            tls: { enabled: true, verify: false },
          },
        },
      },
    };
    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("MYSQL_OK");
  });
});
