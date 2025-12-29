import { beforeEach, describe, expect, test } from "bun:test";
import { createCheckPing, type PingExecResult, type PingExecutor } from "./ping";

// Helper to create a mock executor for testing
function createMockExecutor(result: PingExecResult | { error: PingExecError }): PingExecutor {
  return async () => {
    if ("error" in result) {
      throw result.error;
    }
    return result;
  };
}

// PingExecError extends Error
interface PingExecError extends Error {
  killed?: boolean;
  stderr?: string;
}

describe("checkPing", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    // Reset platform to original before each test
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
    });
  });

  test("should return up for successful ping with latency (Linux/macOS)", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const mockPing = createMockExecutor({
      stdout: "64 bytes from example.com: icmp_seq=1 ttl=54 time=12.3 ms",
    });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "example.com",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("PING_OK");
    expect(result.latencyMs).toBe(12);
    expect(result.message).toContain("12.3ms");
  });

  test("should return up for successful ping with latency (Windows)", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });

    const mockPing = createMockExecutor({
      stdout:
        "Reply from 93.184.216.34: bytes=64 time=15<1ms TTL=54\n" +
        "Ping statistics for 93.184.216.34:\n" +
        "    Packets: Sent = 1, Received = 1, Lost = 0 (0% loss)",
    });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "example.com",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("PING_OK");
  });

  test("should handle custom packet count", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const mockPing = createMockExecutor({
      stdout: "64 bytes from example.com: icmp_seq=1 ttl=54 time=12.3 ms",
    });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "example.com",
            packetCount: 5,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("PING_OK");
  });

  test("should return up for successful ping without parseable latency", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const mockPing = createMockExecutor({
      stdout:
        "PING example.com (93.184.216.34): 56 data bytes\n" +
        "64 bytes from 93.184.216.34: icmp_seq=0 ttl=54 time=0.123 ms\n" +
        "--- example.com ping statistics ---\n" +
        "1 packets transmitted, 1 packets received, 0.0% packet loss",
    });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "example.com",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("PING_OK");
    expect(result.message).toContain("Ping successful");
  });

  test("should return down when 100% packet loss", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const mockPing = createMockExecutor({
      stdout:
        "PING example.com (93.184.216.34): 56 data bytes\n" +
        "Request timeout\n" +
        "--- example.com ping statistics ---\n" +
        "1 packets transmitted, 0 packets received, 100.0% packet loss",
    });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "example.com",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("PING_UNREACHABLE");
    expect(result.message).toBe("Host unreachable or all packets lost");
  });

  test("should return down when unreachable in stdout", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const mockPing = createMockExecutor({
      stdout:
        "PING example.com (93.184.216.34): 56 data bytes\n" +
        "From 192.168.1.1 icmp_seq=1 Destination Host Unreachable",
    });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "example.com",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("PING_UNREACHABLE");
  });

  test("should handle IP addresses", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const mockPing = createMockExecutor({
      stdout: "64 bytes from 8.8.8.8: icmp_seq=1 ttl=54 time=8.5 ms",
    });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "8.8.8.8",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("PING_OK");
  });

  test("should handle localhost", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const mockPing = createMockExecutor({
      stdout: "64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=0.1 ms",
    });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "localhost",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("PING_OK");
  });

  test("should handle decimal latency values", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const mockPing = createMockExecutor({
      stdout: "64 bytes from example.com: icmp_seq=1 ttl=54 time=0.456 ms",
    });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "example.com",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("PING_OK");
    expect(result.latencyMs).toBe(0); // Math.round(0.456) = 0
  });

  test("should return down on timeout (killed)", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const error = new Error("Command timed out") as PingExecError;
    error.killed = true;

    const mockPing = createMockExecutor({ error });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 5,
        },
        target: {
          ping: {
            host: "example.com",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 5);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("TIMEOUT");
    expect(result.message).toContain("5s");
  });

  test("should return down for unknown host", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const error = new Error("ping: unknown host: nonexistent.example.com") as PingExecError;
    error.stderr = "ping: unknown host: nonexistent.example.com";

    const mockPing = createMockExecutor({ error });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "nonexistent.example.com",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("DNS_NXDOMAIN");
    expect(result.message).toBe("Host not found");
  });

  test("should return down for host not found (Linux)", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const error = new Error(
      "ping: nonexistent.example.com: Name or service not known",
    ) as PingExecError;
    error.stderr = "ping: nonexistent.example.com: Name or service not known";

    const mockPing = createMockExecutor({ error });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "nonexistent.example.com",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("DNS_NXDOMAIN");
  });

  test("should return down for unreachable host", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const error = new Error("ping: sendto: Unreachable") as PingExecError;
    error.stderr = "ping: sendto: Unreachable";

    const mockPing = createMockExecutor({ error });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "192.168.255.255",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("UNREACHABLE");
    expect(result.message).toBe("Host unreachable");
  });

  test("should return down for general ping error", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const error = new Error("ping: socket: Operation not permitted") as PingExecError;
    error.stderr = "ping: socket: Operation not permitted";

    const mockPing = createMockExecutor({ error });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "example.com",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("PING_ERROR");
    expect(result.message).toContain("Operation not permitted");
  });

  test("should return down when no ping target configured", async () => {
    const mockPing = createMockExecutor({
      stdout: "",
    });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {},
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("INVALID_CONFIG");
    expect(result.message).toBe("No ping target configured");
  });

  test("should handle unknown errors gracefully", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const error = new Error("Unexpected error") as PingExecError;

    const mockPing = createMockExecutor({ error });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "example.com",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("PING_ERROR");
    expect(result.message).toBe("Unexpected error");
  });

  test("should return down for 'No route' error", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const error = new Error("ping: sendto: No route to host") as PingExecError;
    error.stderr = "ping: sendto: No route to host";

    const mockPing = createMockExecutor({ error });

    const checker = createCheckPing(mockPing);
    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "ping" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          ping: {
            host: "192.168.255.255",
            packetCount: 1,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("UNREACHABLE");
    expect(result.message).toBe("Host unreachable");
  });
});
