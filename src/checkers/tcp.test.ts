import { describe, expect, test } from "bun:test";
import { createTcpMonitor, createTcpMonitorNoTarget } from "../test-utils/fixtures/monitors";
import { createMockSocketFactory, type TcpSocket } from "../test-utils/mocks/network";
import { createCheckTcp } from "./tcp";

describe("checkTcp", () => {
  test("returns up for successful TCP connection", async () => {
    const checker = createCheckTcp(createMockSocketFactory());
    const result = await checker(createTcpMonitor(), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("TCP_OK");
    expect(result.message).toBe("TCP connection successful");
  });

  test("returns up for successful TCP connection with send and no expect", async () => {
    const checker = createCheckTcp(createMockSocketFactory());
    const result = await checker(createTcpMonitor({ send: "PING\r\n" }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("TCP_OK");
    expect(result.message).toBe("TCP connection successful");
  });

  test("returns up when send/expect pattern matches", async () => {
    const mockFactory = createMockSocketFactory({
      on(event: string, listener: (...args: unknown[]) => void): TcpSocket {
        if (event === "connect") {
          setTimeout(() => listener(), 10);
        } else if (event === "data") {
          setTimeout(() => listener("PONG\r\n"), 20);
        }
        return this as unknown as TcpSocket;
      },
    });
    const checker = createCheckTcp(mockFactory);
    const result = await checker(createTcpMonitor({ send: "PING\r\n", expect: "PONG" }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("TCP_OK");
    expect(result.message).toBe("TCP connection successful with expected response");
  });

  test("times out when waiting for expect response", async () => {
    const mockFactory = createMockSocketFactory({
      on(event: string, listener: (...args: unknown[]) => void): TcpSocket {
        if (event === "connect") {
          setTimeout(() => listener(), 10);
        }
        // No data event - expect never matches
        return this as unknown as TcpSocket;
      },
      write(_buffer: string, cb?: (err?: Error) => void): boolean {
        setTimeout(() => cb?.(), 5);
        return true;
      },
    });
    const checker = createCheckTcp(mockFactory);
    const result = await checker(
      createTcpMonitor({ send: "PING\r\n", expect: "PONG", timeoutSeconds: 1 }),
      1,
    );

    expect(result.state).toBe("down");
    expect(result.reason).toBe("TIMEOUT");
    expect(result.message).toBe("TCP connection timeout after 1s");
  });

  // Parameterized error handling tests
  const errorCases = [
    { error: "ECONNREFUSED", reason: "CONNECTION_REFUSED", message: "Connection refused" },
    { error: "ENOTFOUND", reason: "DNS_NXDOMAIN", message: "Host not found" },
    { error: "ETIMEDOUT", reason: "TIMEOUT", message: "Connection timeout" },
    { error: "ECONNRESET", reason: "CONNECTION_ERROR", message: "ECONNRESET" },
  ];

  for (const { error, reason, message } of errorCases) {
    test(`returns ${reason} for ${error}`, async () => {
      const mockFactory = createMockSocketFactory({
        on(event: string, listener: (...args: unknown[]) => void): TcpSocket {
          if (event === "error") {
            setTimeout(() => listener(new Error(error)), 10);
          }
          return this as unknown as TcpSocket;
        },
      });
      const checker = createCheckTcp(mockFactory);
      const result = await checker(createTcpMonitor(), 10);

      expect(result.state).toBe("down");
      expect(result.reason).toBe(reason);
      expect(result.message).toBe(message);
    });
  }

  test("returns down on send error", async () => {
    const mockFactory = createMockSocketFactory({
      on(event: string, listener: (...args: unknown[]) => void): TcpSocket {
        if (event === "connect") {
          setTimeout(() => listener(), 10);
        }
        return this as unknown as TcpSocket;
      },
      write(_buffer: string, cb?: (err?: Error) => void): boolean {
        setTimeout(() => cb?.(new Error("Write failed")), 5);
        return true;
      },
    });
    const checker = createCheckTcp(mockFactory);
    const result = await checker(createTcpMonitor({ send: "PING\r\n" }), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("SEND_ERROR");
    expect(result.message).toBe("Failed to send data: Write failed");
  });

  test("returns down when no TCP target configured", async () => {
    const checker = createCheckTcp(createMockSocketFactory());
    const result = await checker(createTcpMonitorNoTarget(), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("INVALID_CONFIG");
    expect(result.message).toBe("No TCP target configured");
  });

  test("handles IP addresses", async () => {
    const checker = createCheckTcp(createMockSocketFactory());
    const result = await checker(createTcpMonitor({ host: "192.168.1.1", port: 80 }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("TCP_OK");
  });

  test("handles localhost", async () => {
    const checker = createCheckTcp(createMockSocketFactory());
    const result = await checker(createTcpMonitor({ host: "localhost", port: 3000 }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("TCP_OK");
  });

  test("handles partial expect match", async () => {
    const mockFactory = createMockSocketFactory({
      on(event: string, listener: (...args: unknown[]) => void): TcpSocket {
        if (event === "connect") {
          setTimeout(() => listener(), 10);
        } else if (event === "data") {
          setTimeout(() => listener("Part1Part2"), 20);
        }
        return this as unknown as TcpSocket;
      },
    });
    const checker = createCheckTcp(mockFactory);
    const result = await checker(createTcpMonitor({ send: "GET\r\n", expect: "Part2" }), 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("TCP_OK");
    expect(result.message).toBe("TCP connection successful with expected response");
  });

  test("times out on initial connection", async () => {
    const mockFactory = createMockSocketFactory({
      on(_event: string, _listener: (...args: unknown[]) => void): TcpSocket {
        // Never trigger any event
        return this as unknown as TcpSocket;
      },
    });
    const checker = createCheckTcp(mockFactory);
    const result = await checker(
      createTcpMonitor({ host: "slowhost.example.com", timeoutSeconds: 1 }),
      1,
    );

    expect(result.state).toBe("down");
    expect(result.reason).toBe("TIMEOUT");
    expect(result.message).toBe("TCP connection timeout after 1s");
  });
});
