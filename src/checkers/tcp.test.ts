import { describe, expect, test } from "bun:test";
import { createCheckTcp, type SocketFactory, type TcpSocket } from "./tcp";

// Helper to create a mock socket factory with custom overrides
function createMockSocketFactory(overrides?: Record<string, unknown>): SocketFactory {
  return () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    const socket: TcpSocket = {
      on(event: string, listener: (...args: unknown[]) => void) {
        if (!listeners[event]) {
          listeners[event] = [];
        }
        listeners[event].push(listener);
        return this;
      },
      connect(_port: number, _host?: string): TcpSocket {
        setTimeout(() => {
          if (listeners.connect) {
            for (const l of listeners.connect) {
              l();
            }
          }
        }, 10);
        return this;
      },
      write(_buffer: string, cb?: (err?: Error) => void): boolean {
        setTimeout(() => {
          cb?.();
        }, 5);
        return true;
      },
      destroy(): void {
        // No-op for mock
      },
    };

    // Apply overrides if provided
    if (overrides) {
      const entries = Object.entries(overrides);
      for (const [key, value] of entries) {
        (socket as unknown as Record<string, unknown>)[key] = value;
      }
    }

    return socket;
  };
}

describe("checkTcp", () => {
  test("should return up for successful TCP connection", async () => {
    const mockFactory = createMockSocketFactory();
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          tcp: {
            host: "example.com",
            port: 443,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("TCP_OK");
    expect(result.message).toBe("TCP connection successful");
  });

  test("should return up for successful TCP connection with send and no expect", async () => {
    const mockFactory = createMockSocketFactory();
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          tcp: {
            host: "example.com",
            port: 443,
            send: "PING\r\n",
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("TCP_OK");
    expect(result.message).toBe("TCP connection successful");
  });

  test("should return up when send/expect pattern matches", async () => {
    const mockFactory = createMockSocketFactory({
      on(event: string, listener: (...args: unknown[]) => void) {
        if (event === "connect") {
          setTimeout(() => listener(), 10);
        } else if (event === "data") {
          // Send data response after write
          setTimeout(() => listener("PONG\r\n"), 20);
        }
        return this;
      },
    });
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          tcp: {
            host: "example.com",
            port: 443,
            send: "PING\r\n",
            expect: "PONG",
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("TCP_OK");
    expect(result.message).toBe("TCP connection successful with expected response");
  });

  test("should timeout when waiting for expect response", async () => {
    // Create a mock socket that connects but never sends data
    const mockFactory = createMockSocketFactory({
      on(event: string, listener: (...args: unknown[]) => void) {
        if (event === "connect") {
          setTimeout(() => listener(), 10);
        }
        // Note: no data event listener registered, so expect never matches
        return this;
      },
      write(_buffer: string, cb?: (err?: Error) => void): boolean {
        setTimeout(() => cb?.(), 5);
        return true;
      },
    });
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 1,
        },
        target: {
          tcp: {
            host: "example.com",
            port: 443,
            send: "PING\r\n",
            expect: "PONG",
          },
        },
      },
    };

    const result = await checker(monitor, 1);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("TIMEOUT");
    expect(result.message).toBe("TCP connection timeout after 1s");
  });

  test("should return down for connection refused", async () => {
    const mockFactory = createMockSocketFactory({
      on(event: string, listener: (...args: unknown[]) => void) {
        if (event === "error") {
          const error = new Error("ECONNREFUSED");
          setTimeout(() => listener(error), 10);
        }
        return this;
      },
    });
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          tcp: {
            host: "localhost",
            port: 9999,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("CONNECTION_REFUSED");
    expect(result.message).toBe("Connection refused");
  });

  test("should return down for DNS failure", async () => {
    const mockFactory = createMockSocketFactory({
      on(event: string, listener: (...args: unknown[]) => void) {
        if (event === "error") {
          const error = new Error("ENOTFOUND");
          setTimeout(() => listener(error), 10);
        }
        return this;
      },
    });
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          tcp: {
            host: "nonexistent.invalid",
            port: 443,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("DNS_NXDOMAIN");
    expect(result.message).toBe("Host not found");
  });

  test("should return down for connection timeout", async () => {
    const mockFactory = createMockSocketFactory({
      on(event: string, listener: (...args: unknown[]) => void) {
        if (event === "error") {
          const error = new Error("ETIMEDOUT");
          setTimeout(() => listener(error), 10);
        }
        return this;
      },
    });
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          tcp: {
            host: "example.com",
            port: 443,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("TIMEOUT");
    expect(result.message).toBe("Connection timeout");
  });

  test("should return down for general connection error", async () => {
    const mockFactory = createMockSocketFactory({
      on(event: string, listener: (...args: unknown[]) => void) {
        if (event === "error") {
          const error = new Error("ECONNRESET");
          setTimeout(() => listener(error), 10);
        }
        return this;
      },
    });
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          tcp: {
            host: "example.com",
            port: 443,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("CONNECTION_ERROR");
    expect(result.message).toBe("ECONNRESET");
  });

  test("should return down on send error", async () => {
    const mockFactory = createMockSocketFactory({
      on(event: string, listener: (...args: unknown[]) => void) {
        if (event === "connect") {
          setTimeout(() => listener(), 10);
        }
        return this;
      },
      write(_buffer: string, cb?: (err?: Error) => void): boolean {
        setTimeout(() => cb?.(new Error("Write failed")), 5);
        return true;
      },
    });
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          tcp: {
            host: "example.com",
            port: 443,
            send: "PING\r\n",
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("SEND_ERROR");
    expect(result.message).toBe("Failed to send data: Write failed");
  });

  test("should return down when no TCP target configured", async () => {
    const mockFactory = createMockSocketFactory();
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
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
    expect(result.message).toBe("No TCP target configured");
  });

  test("should handle IP addresses", async () => {
    const mockFactory = createMockSocketFactory();
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          tcp: {
            host: "192.168.1.1",
            port: 80,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("TCP_OK");
  });

  test("should handle localhost", async () => {
    const mockFactory = createMockSocketFactory();
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          tcp: {
            host: "localhost",
            port: 3000,
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("TCP_OK");
  });

  test("should handle partial expect match", async () => {
    const mockFactory = createMockSocketFactory({
      on(event: string, listener: (...args: unknown[]) => void) {
        if (event === "connect") {
          setTimeout(() => listener(), 10);
        } else if (event === "data") {
          setTimeout(() => listener("Part1Part2"), 20);
        }
        return this;
      },
    });
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 10,
        },
        target: {
          tcp: {
            host: "example.com",
            port: 443,
            send: "GET\r\n",
            expect: "Part2",
          },
        },
      },
    };

    const result = await checker(monitor, 10);

    expect(result.state).toBe("up");
    expect(result.reason).toBe("TCP_OK");
    expect(result.message).toBe("TCP connection successful with expected response");
  });

  test("should timeout on initial connection", async () => {
    // Create a mock socket that never connects
    const mockFactory = createMockSocketFactory({
      on(_event: string, _listener: (...args: unknown[]) => void) {
        // Never trigger any event
        return this;
      },
    });
    const checker = createCheckTcp(mockFactory);

    const monitor = {
      apiVersion: "monitoring.yuptime.io/v1" as const,
      kind: "Monitor" as const,
      metadata: { name: "test", namespace: "default" },
      spec: {
        enabled: true,
        type: "tcp" as const,
        schedule: {
          intervalSeconds: 60,
          timeoutSeconds: 1,
        },
        target: {
          tcp: {
            host: "slowhost.example.com",
            port: 443,
          },
        },
      },
    };

    const result = await checker(monitor, 1);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("TIMEOUT");
    expect(result.message).toBe("TCP connection timeout after 1s");
  });
});
