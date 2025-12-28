import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

/**
 * TCP connection checker
 */
export async function checkTcp(
  monitor: Monitor,
  timeout: number,
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
    // Create a simple TCP connection using node's net module
    const net = require("node:net");
    const socket = new net.Socket();

    let completed = false;
    let _result: CheckResult | null = null;

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      if (!completed) {
        socket.destroy();
        completed = true;
        _result = {
          state: "down",
          latencyMs: timeout * 1000,
          reason: "TIMEOUT",
          message: `TCP connection timeout after ${timeout}s`,
        };
      }
    }, timeout * 1000);

    return new Promise((resolve) => {
      socket.on("connect", () => {
        if (completed) return;

        const latencyMs = Date.now() - startTime;
        clearTimeout(timeoutHandle);
        completed = true;

        // If there's a send/expect configured, try it
        if (target.send) {
          socket.write(target.send, (error) => {
            if (error) {
              socket.destroy();
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

              socket.on("data", (data) => {
                received += data.toString();

                if (received.includes(expectedStr)) {
                  socket.destroy();
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
          resolve({
            state: "up",
            latencyMs,
            reason: "TCP_OK",
            message: "TCP connection successful",
          });
        }
      });

      socket.on("error", (error: Error) => {
        if (completed) return;

        clearTimeout(timeoutHandle);
        completed = true;
        socket.destroy();

        const latencyMs = Date.now() - startTime;

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
