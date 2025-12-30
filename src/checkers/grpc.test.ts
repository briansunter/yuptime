import { describe, expect, test } from "bun:test";
import { createGrpcMonitor, createGrpcMonitorNoTarget } from "../test-utils/fixtures/monitors";
import { createGrpcError, createMockGrpcClientFactory } from "../test-utils/mocks/database";
import { createCheckGrpc, GRPC_HEALTH_STATUS } from "./grpc";

describe("checkGrpc", () => {
  test("returns up for SERVING status", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkStatus: GRPC_HEALTH_STATUS.SERVING }),
    );
    const result = await checker(createGrpcMonitor(), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("GRPC_SERVING");
    expect(result.message).toBe("gRPC service is serving");
  });

  test("returns down for NOT_SERVING status", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkStatus: GRPC_HEALTH_STATUS.NOT_SERVING }),
    );
    const result = await checker(createGrpcMonitor(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("GRPC_NOT_SERVING");
    expect(result.message).toBe("gRPC service is not serving");
  });

  test("returns down for SERVICE_UNKNOWN status", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkStatus: GRPC_HEALTH_STATUS.SERVICE_UNKNOWN }),
    );
    const result = await checker(createGrpcMonitor({ service: "my.service" }), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("GRPC_SERVICE_UNKNOWN");
    expect(result.message).toBe("gRPC service 'my.service' is unknown");
  });

  test("returns down for UNKNOWN status", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkStatus: GRPC_HEALTH_STATUS.UNKNOWN }),
    );
    const result = await checker(createGrpcMonitor(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("GRPC_UNKNOWN");
    expect(result.message).toContain("unknown status: 0");
  });

  test("returns down when no gRPC target configured", async () => {
    const checker = createCheckGrpc(createMockGrpcClientFactory());
    const result = await checker(createGrpcMonitorNoTarget(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("INVALID_CONFIG");
    expect(result.message).toBe("No gRPC target configured");
  });

  // gRPC error code tests
  test("returns GRPC_UNAVAILABLE for error code 14", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkError: createGrpcError("Service unavailable", 14) }),
    );
    const result = await checker(createGrpcMonitor(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("GRPC_UNAVAILABLE");
    expect(result.message).toBe("gRPC service unavailable");
  });

  test("returns TIMEOUT for error code 4 (DEADLINE_EXCEEDED)", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkError: createGrpcError("Deadline exceeded", 4) }),
    );
    const result = await checker(createGrpcMonitor(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("TIMEOUT");
    expect(result.message).toBe("gRPC connection timeout after 10s");
  });

  // Standard error handling tests
  const errorCases = [
    {
      name: "connection refused",
      error: new Error("connect ECONNREFUSED 127.0.0.1:50051"),
      reason: "CONNECTION_REFUSED",
      message: "gRPC connection refused",
    },
    {
      name: "host not found",
      error: new Error("getaddrinfo ENOTFOUND grpc.example.com"),
      reason: "DNS_NXDOMAIN",
      message: "gRPC host not found",
    },
    {
      name: "generic error",
      error: new Error("Some other gRPC error"),
      reason: "GRPC_ERROR",
      message: "Some other gRPC error",
    },
  ];

  for (const { name, error, reason, message } of errorCases) {
    test(`returns ${reason} for ${name}`, async () => {
      const checker = createCheckGrpc(createMockGrpcClientFactory({ checkError: error }));
      const result = await checker(createGrpcMonitor(), 10);

      expect(result.state).toBe("down");
      expect(result.reason).toBe(reason);
      expect(result.message).toBe(message);
    });
  }

  test("handles custom port", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkStatus: GRPC_HEALTH_STATUS.SERVING }),
    );
    const result = await checker(createGrpcMonitor({ port: 9090 }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("GRPC_SERVING");
  });

  test("handles custom service name", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkStatus: GRPC_HEALTH_STATUS.SERVING }),
    );
    const result = await checker(createGrpcMonitor({ service: "my.custom.Service" }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("GRPC_SERVING");
  });

  test("handles TLS enabled", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkStatus: GRPC_HEALTH_STATUS.SERVING }),
    );
    const result = await checker(createGrpcMonitor({ tlsEnabled: true }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("GRPC_SERVING");
  });

  test("handles TLS with verification disabled", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkStatus: GRPC_HEALTH_STATUS.SERVING }),
    );
    const result = await checker(createGrpcMonitor({ tlsEnabled: true, tlsVerify: false }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("GRPC_SERVING");
  });

  test("includes latency in result", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkStatus: GRPC_HEALTH_STATUS.SERVING }),
    );
    const result = await checker(createGrpcMonitor(), 10);

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("uses default port 50051 when not specified", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkStatus: GRPC_HEALTH_STATUS.SERVING }),
    );
    const monitor = createGrpcMonitor();
    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
  });

  test("uses empty string as default service name", async () => {
    const checker = createCheckGrpc(
      createMockGrpcClientFactory({ checkStatus: GRPC_HEALTH_STATUS.SERVING }),
    );
    const monitor = createGrpcMonitor(); // No service specified
    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
  });
});
