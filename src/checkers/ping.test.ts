import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createPingMonitor, createPingMonitorNoTarget } from "../test-utils/fixtures/monitors";
import { createMockPingExecutor, type PingExecError } from "../test-utils/mocks/network";
import { createCheckPing } from "./ping";

describe("checkPing", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  describe("on Linux/macOS", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "linux" });
    });

    test("returns up for successful ping with latency", async () => {
      const mockPing = createMockPingExecutor({
        stdout: "64 bytes from example.com: icmp_seq=1 ttl=54 time=12.3 ms",
      });
      const checker = createCheckPing(mockPing);
      const result = await checker(createPingMonitor(), 10);

      expect(result.state).toBe("up");
      expect(result.reason).toBe("PING_OK");
      expect(result.latencyMs).toBe(12);
      expect(result.message).toContain("12.3ms");
    });

    test("handles custom packet count", async () => {
      const mockPing = createMockPingExecutor({
        stdout: "64 bytes from example.com: icmp_seq=1 ttl=54 time=12.3 ms",
      });
      const checker = createCheckPing(mockPing);
      const result = await checker(createPingMonitor({ packetCount: 5 }), 10);

      expect(result.state).toBe("up");
      expect(result.reason).toBe("PING_OK");
    });

    test("returns up for successful ping without parseable latency", async () => {
      const mockPing = createMockPingExecutor({
        stdout:
          "PING example.com (93.184.216.34): 56 data bytes\n" +
          "64 bytes from 93.184.216.34: icmp_seq=0 ttl=54 time=0.123 ms\n" +
          "--- example.com ping statistics ---\n" +
          "1 packets transmitted, 1 packets received, 0.0% packet loss",
      });
      const checker = createCheckPing(mockPing);
      const result = await checker(createPingMonitor(), 10);

      expect(result.state).toBe("up");
      expect(result.reason).toBe("PING_OK");
      expect(result.message).toContain("Ping successful");
    });

    test("returns down when 100% packet loss", async () => {
      const mockPing = createMockPingExecutor({
        stdout:
          "PING example.com (93.184.216.34): 56 data bytes\n" +
          "Request timeout\n" +
          "--- example.com ping statistics ---\n" +
          "1 packets transmitted, 0 packets received, 100.0% packet loss",
      });
      const checker = createCheckPing(mockPing);
      const result = await checker(createPingMonitor(), 10);

      expect(result.state).toBe("down");
      expect(result.reason).toBe("PING_UNREACHABLE");
      expect(result.message).toBe("Host unreachable or all packets lost");
    });

    test("returns down when unreachable in stdout", async () => {
      const mockPing = createMockPingExecutor({
        stdout:
          "PING example.com (93.184.216.34): 56 data bytes\n" +
          "From 192.168.1.1 icmp_seq=1 Destination Host Unreachable",
      });
      const checker = createCheckPing(mockPing);
      const result = await checker(createPingMonitor(), 10);

      expect(result.state).toBe("down");
      expect(result.reason).toBe("PING_UNREACHABLE");
    });

    test("handles IP addresses", async () => {
      const mockPing = createMockPingExecutor({
        stdout: "64 bytes from 8.8.8.8: icmp_seq=1 ttl=54 time=8.5 ms",
      });
      const checker = createCheckPing(mockPing);
      const result = await checker(createPingMonitor({ host: "8.8.8.8" }), 10);

      expect(result.state).toBe("up");
      expect(result.reason).toBe("PING_OK");
    });

    test("handles localhost", async () => {
      const mockPing = createMockPingExecutor({
        stdout: "64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=0.1 ms",
      });
      const checker = createCheckPing(mockPing);
      const result = await checker(createPingMonitor({ host: "localhost" }), 10);

      expect(result.state).toBe("up");
      expect(result.reason).toBe("PING_OK");
    });

    test("handles decimal latency values", async () => {
      const mockPing = createMockPingExecutor({
        stdout: "64 bytes from example.com: icmp_seq=1 ttl=54 time=0.456 ms",
      });
      const checker = createCheckPing(mockPing);
      const result = await checker(createPingMonitor(), 10);

      expect(result.state).toBe("up");
      expect(result.reason).toBe("PING_OK");
      expect(result.latencyMs).toBe(0); // Math.round(0.456) = 0
    });

    // Parameterized error tests
    const errorCases = [
      {
        name: "timeout (killed)",
        error: { message: "Command timed out", killed: true },
        reason: "TIMEOUT",
        messageContains: "5s",
      },
      {
        name: "unknown host",
        error: {
          message: "ping: unknown host",
          stderr: "ping: unknown host: nonexistent.example.com",
        },
        reason: "DNS_NXDOMAIN",
        messageEquals: "Host not found",
      },
      {
        name: "name not known (Linux)",
        error: {
          message: "Name or service not known",
          stderr: "ping: nonexistent.example.com: Name or service not known",
        },
        reason: "DNS_NXDOMAIN",
      },
      {
        name: "unreachable host",
        error: { message: "ping: sendto: Unreachable", stderr: "ping: sendto: Unreachable" },
        reason: "UNREACHABLE",
        messageEquals: "Host unreachable",
      },
      {
        name: "no route",
        error: {
          message: "ping: sendto: No route to host",
          stderr: "ping: sendto: No route to host",
        },
        reason: "UNREACHABLE",
        messageEquals: "Host unreachable",
      },
      {
        name: "general error",
        error: {
          message: "ping: socket: Operation not permitted",
          stderr: "ping: socket: Operation not permitted",
        },
        reason: "PING_ERROR",
        messageContains: "Operation not permitted",
      },
      {
        name: "unknown error",
        error: { message: "Unexpected error" },
        reason: "PING_ERROR",
        messageEquals: "Unexpected error",
      },
    ];

    for (const { name, error, reason, messageEquals, messageContains } of errorCases) {
      test(`returns down for ${name}`, async () => {
        const err = new Error(error.message) as PingExecError;
        if ("killed" in error) err.killed = error.killed;
        if ("stderr" in error) err.stderr = error.stderr;

        const mockPing = createMockPingExecutor({ error: err });
        const checker = createCheckPing(mockPing);
        const result = await checker(createPingMonitor({ timeoutSeconds: 5 }), 5);

        expect(result.state).toBe("down");
        expect(result.reason).toBe(reason);
        if (messageEquals) {
          expect(result.message).toBe(messageEquals);
        }
        if (messageContains) {
          expect(result.message).toContain(messageContains);
        }
      });
    }
  });

  describe("on Windows", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "win32" });
    });

    test("returns up for successful ping with latency", async () => {
      const mockPing = createMockPingExecutor({
        stdout:
          "Reply from 93.184.216.34: bytes=64 time=15<1ms TTL=54\n" +
          "Ping statistics for 93.184.216.34:\n" +
          "    Packets: Sent = 1, Received = 1, Lost = 0 (0% loss)",
      });
      const checker = createCheckPing(mockPing);
      const result = await checker(createPingMonitor(), 10);

      expect(result.state).toBe("up");
      expect(result.reason).toBe("PING_OK");
    });
  });

  test("returns down when no ping target configured", async () => {
    const mockPing = createMockPingExecutor({ stdout: "" });
    const checker = createCheckPing(mockPing);
    const result = await checker(createPingMonitorNoTarget(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("INVALID_CONFIG");
    expect(result.message).toBe("No ping target configured");
  });
});
