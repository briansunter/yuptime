/**
 * Mock network operations for testing
 */

import { afterEach, beforeEach } from "bun:test";

/**
 * Mock fetch responses
 */
export interface MockFetchResponse {
  status: number;
  statusText: string;
  headers: Record<string, string> | Headers;
  body: string;
}

/**
 * Setup mock fetch for testing
 */
export function mockFetch(response: MockFetchResponse | MockFetchResponse[]): void {
  const responses = Array.isArray(response) ? response : [response];
  let callCount = 0;

  beforeEach(() => {
    const mockFetchFn = async () => {
      const mockResponse = responses[Math.min(callCount, responses.length - 1)];
      callCount++;

      if (!mockResponse) {
        throw new Error("No mock response configured");
      }

      return {
        ok: mockResponse.status >= 200 && mockResponse.status < 300,
        status: mockResponse.status,
        statusText: mockResponse.statusText,
        headers: new Headers(mockResponse.headers),
        text: async () => mockResponse.body,
        json: async () => JSON.parse(mockResponse.body),
      } as Response;
    };

    global.fetch = mockFetchFn as unknown as typeof fetch;
  });

  afterEach(() => {
    // Reset fetch after test
    callCount = 0;
  });
}

/**
 * Restore original fetch
 */
export function restoreFetch() {
  global.fetch = fetch;
}

/**
 * Mock DNS resolution
 */
export function mockDNS(_records: string[]) {
  // DNS mocking requires more sophisticated setup
  // This is a placeholder for future implementation
  beforeEach(() => {
    // TODO: Implement DNS mocking
  });
}

/**
 * TCP Socket interface (mirrors the one in tcp.ts)
 */
export interface TcpSocket {
  on(event: string, listener: (...args: unknown[]) => void): TcpSocket;
  connect(port: number, host?: string): TcpSocket;
  write(buffer: string, cb?: (err?: Error) => void): boolean;
  destroy(): void;
}

/**
 * Socket factory type
 */
export type SocketFactory = () => TcpSocket;

/**
 * Socket method overrides for mock customization
 */
export interface SocketOverrides {
  on?: (event: string, listener: (...args: unknown[]) => void) => TcpSocket;
  connect?: (port: number, host?: string) => TcpSocket;
  write?: (buffer: string, cb?: (err?: Error) => void) => boolean;
  destroy?: () => void;
}

/**
 * Creates a mock socket factory for TCP checker tests
 * By default creates a socket that successfully connects
 */
export function createMockSocketFactory(overrides?: SocketOverrides): SocketFactory {
  return () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    const socket: TcpSocket = {
      on(event: string, listener: (...args: unknown[]) => void) {
        if (overrides?.on) {
          return overrides.on.call(this, event, listener);
        }
        if (!listeners[event]) {
          listeners[event] = [];
        }
        listeners[event].push(listener);
        return this;
      },
      connect(_port: number, _host?: string): TcpSocket {
        if (overrides?.connect) {
          return overrides.connect.call(this, _port, _host);
        }
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
        if (overrides?.write) {
          return overrides.write.call(this, _buffer, cb);
        }
        setTimeout(() => {
          cb?.();
        }, 5);
        return true;
      },
      destroy(): void {
        if (overrides?.destroy) {
          overrides.destroy.call(this);
        }
      },
    };

    return socket;
  };
}

/**
 * Ping execution result
 */
export interface PingExecResult {
  stdout: string;
  stderr?: string;
}

/**
 * Ping execution error
 */
export interface PingExecError extends Error {
  killed?: boolean;
  stderr?: string;
}

/**
 * Ping executor type
 */
export type PingExecutor = (
  command: string,
  args: string[],
  options: { timeout: number },
) => Promise<PingExecResult>;

/**
 * Creates a mock ping executor for ping checker tests
 */
export function createMockPingExecutor(
  result: PingExecResult | { error: PingExecError },
): PingExecutor {
  return async () => {
    if ("error" in result) {
      throw result.error;
    }
    return result;
  };
}

/**
 * Create a successful HTTP response mock
 */
export function successResponse(body: string, status: number = 200): MockFetchResponse {
  return {
    status,
    statusText: "OK",
    headers: { "Content-Type": "application/json" },
    body,
  };
}

/**
 * Create a failed HTTP response mock
 */
export function errorResponse(status: number, statusText: string = "Error"): MockFetchResponse {
  return {
    status,
    statusText,
    headers: {},
    body: JSON.stringify({ error: statusText }),
  };
}
