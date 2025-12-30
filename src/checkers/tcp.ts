import * as net from "node:net";
import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

/**
 * TCP Socket interface for dependency injection
 */
export interface TcpSocket {
  on(event: string, listener: (...args: unknown[]) => void): TcpSocket;
  connect(port: number, host?: string): TcpSocket;
  write(buffer: string, cb?: (err?: Error) => void): boolean;
  destroy(): void;
}

/**
 * Socket factory type for dependency injection
 */
export type SocketFactory = () => TcpSocket;

/**
 * Default socket factory using Node.js net module
 */
function createDefaultSocket(): TcpSocket {
  return new net.Socket() as unknown as TcpSocket;
}

/**
 * Internal TCP checker implementation with injectable socket factory
 */
async function checkTcpWithSocketFactory(
  monitor: Monitor,
  timeout: number,
  socketFactory: SocketFactory,
): Promise<CheckResult> {
  const spec = monitor.spec;
  const target = spec.target.tcp;

  if (!target) {
    return {
      state: "down",
      latencyMs: 0,
      reason: "INVALID_CONFIG",
      message: "No TCP target configured",
    };
  }

  const startTime = Date.now();

  try {
    return new Promise((resolve) => {
      // Create a TCP connection using injected socket factory
      const socket = socketFactory();

      let completed = false;

      // Set timeout
      const timeoutHandle = setTimeout(() => {
        if (!completed) {
          socket.destroy();
          completed = true;
          resolve({
            state: "down",
            latencyMs: timeout * 1000,
            reason: "TIMEOUT",
            message: `TCP connection timeout after ${timeout}s`,
          });
        }
      }, timeout * 1000);

      const self: TcpSocket = socket;

      self.on("connect", () => {
        if (completed) return;

        const latencyMs = Date.now() - startTime;

        // If there's a send/expect configured, try it
        if (target.send) {
          socket.write(target.send, (error) => {
            if (error) {
              socket.destroy();
              completed = true;
              clearTimeout(timeoutHandle);
              resolve({
                state: "down",
                latencyMs,
                reason: "SEND_ERROR",
                message: `Failed to send data: ${error.message}`,
              });
              return;
            }

            // Wait for response if expect is configured
            if (target.expect) {
              let received = "";
              const expectedStr = target.expect;

              self.on("data", (data: unknown) => {
                received += (data as Buffer).toString();

                if (received.includes(expectedStr)) {
                  socket.destroy();
                  completed = true;
                  clearTimeout(timeoutHandle);
                  resolve({
                    state: "up",
                    latencyMs,
                    reason: "TCP_OK",
                    message: "TCP connection successful with expected response",
                  });
                }
              });
            } else {
              socket.destroy();
              completed = true;
              clearTimeout(timeoutHandle);
              resolve({
                state: "up",
                latencyMs,
                reason: "TCP_OK",
                message: "TCP connection successful",
              });
            }
          });
        } else {
          // Just check connection
          socket.destroy();
          completed = true;
          clearTimeout(timeoutHandle);
          resolve({
            state: "up",
            latencyMs,
            reason: "TCP_OK",
            message: "TCP connection successful",
          });
        }
      });

      self.on("error", (...args: unknown[]) => {
        if (completed) return;

        clearTimeout(timeoutHandle);
        completed = true;
        socket.destroy();

        const latencyMs = Date.now() - startTime;
        const error = args[0] as Error;

        if (error.message.includes("ECONNREFUSED")) {
          resolve({
            state: "down",
            latencyMs,
            reason: "CONNECTION_REFUSED",
            message: "Connection refused",
          });
        } else if (error.message.includes("ENOTFOUND")) {
          resolve({
            state: "down",
            latencyMs,
            reason: "DNS_NXDOMAIN",
            message: "Host not found",
          });
        } else if (error.message.includes("ETIMEDOUT")) {
          resolve({
            state: "down",
            latencyMs,
            reason: "TIMEOUT",
            message: "Connection timeout",
          });
        } else {
          resolve({
            state: "down",
            latencyMs,
            reason: "CONNECTION_ERROR",
            message: error.message,
          });
        }
      });

      socket.connect(target.port, target.host);
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.warn({ monitor: monitor.metadata.name, error }, "TCP check failed");

    return {
      state: "down",
      latencyMs,
      reason: "ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * TCP connection checker
 */
export async function checkTcp(monitor: Monitor, timeout: number): Promise<CheckResult> {
  return checkTcpWithSocketFactory(monitor, timeout, createDefaultSocket);
}

/**
 * Create a TCP checker with a custom socket factory (for testing)
 */
export function createCheckTcp(
  socketFactory: SocketFactory,
): (monitor: Monitor, timeout: number) => Promise<CheckResult> {
  return (monitor: Monitor, timeout: number) =>
    checkTcpWithSocketFactory(monitor, timeout, socketFactory);
}
