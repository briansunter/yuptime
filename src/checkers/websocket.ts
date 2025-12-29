/**
 * WebSocket monitor checker
 */

import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

interface WebSocketResult {
  connected: boolean;
  message?: string;
  responseMessage?: string;
  latencyMs: number;
}

/**
 * Connect to WebSocket and optionally send/receive message
 */
async function connectWebSocket(
  url: string,
  timeout: number,
  sendMessage?: string,
  expectedResponse?: string,
): Promise<WebSocketResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let ws: WebSocket | null = null;
    let timeoutHandle: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (ws) {
        try {
          ws.close();
        } catch (_e) {
          // Ignore close errors
        }
      }
    };

    const resolveWithTimeout = (result: WebSocketResult) => {
      cleanup();
      resolve(result);
    };

    // Set timeout
    timeoutHandle = setTimeout(() => {
      resolveWithTimeout({
        connected: false,
        message: `WebSocket timeout after ${timeout}s`,
        latencyMs: Date.now() - startTime,
      });
    }, timeout * 1000);

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        const connectLatency = Date.now() - startTime;

        // If no message to send, just close and return success
        if (!sendMessage) {
          resolveWithTimeout({
            connected: true,
            message: "WebSocket connected",
            latencyMs: connectLatency,
          });
          return;
        }

        // Send message and wait for response
        try {
          ws?.send(sendMessage);
        } catch (error) {
          resolveWithTimeout({
            connected: false,
            message: `Failed to send message: ${error instanceof Error ? error.message : "Unknown error"}`,
            latencyMs: Date.now() - startTime,
          });
        }
      };

      ws.onmessage = (event) => {
        const responseData = event.data?.toString() || "";
        const latency = Date.now() - startTime;

        // If expecting a specific response, check it
        if (expectedResponse) {
          const matches =
            responseData.includes(expectedResponse) ||
            new RegExp(expectedResponse).test(responseData);

          if (matches) {
            resolveWithTimeout({
              connected: true,
              message: "Response matched",
              responseMessage: responseData.substring(0, 500),
              latencyMs: latency,
            });
          } else {
            resolveWithTimeout({
              connected: false,
              message: `Response didn't match expected: ${expectedResponse}`,
              responseMessage: responseData.substring(0, 500),
              latencyMs: latency,
            });
          }
        } else {
          // Just received a message, consider it success
          resolveWithTimeout({
            connected: true,
            message: "Message received",
            responseMessage: responseData.substring(0, 500),
            latencyMs: latency,
          });
        }
      };

      ws.onerror = (event) => {
        resolveWithTimeout({
          connected: false,
          message: `WebSocket error: ${event.type}`,
          latencyMs: Date.now() - startTime,
        });
      };

      ws.onclose = () => {
        if (ws) {
          resolveWithTimeout({
            connected: false,
            message: "WebSocket closed unexpectedly",
            latencyMs: Date.now() - startTime,
          });
        }
      };
    } catch (error) {
      resolveWithTimeout({
        connected: false,
        message: error instanceof Error ? error.message : "Unknown error",
        latencyMs: Date.now() - startTime,
      });
    }
  });
}

export async function checkWebSocket(
  monitor: Monitor,
  timeout: number,
): Promise<CheckResult> {
  const spec = monitor.spec;
  const target = spec.target.websocket;

  if (!target) {
    return {
      state: "down",
      latencyMs: 0,
      reason: "INVALID_CONFIG",
      message: "No WebSocket target configured",
    };
  }

  const startTime = Date.now();

  try {
    const url = target.url;
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      return {
        state: "down",
        latencyMs: 0,
        reason: "INVALID_CONFIG",
        message: "WebSocket URL must start with ws:// or wss://",
      };
    }

    const result = await connectWebSocket(
      url,
      timeout,
      target.send,
      target.expect,
    );

    const latencyMs = result.latencyMs;

    if (result.connected) {
      return {
        state: "up",
        latencyMs,
        reason: "WEBSOCKET_OK",
        message: `${result.message}${result.responseMessage ? ` - Received: ${result.responseMessage}` : ""}`,
      };
    }
    return {
      state: "down",
      latencyMs,
      reason: "WEBSOCKET_ERROR",
      message: result.message || "WebSocket check failed",
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.warn(
      { monitor: monitor.metadata.name, error },
      "WebSocket check failed",
    );

    return {
      state: "down",
      latencyMs,
      reason: "ERROR",
      message:
        error instanceof Error ? error.message : "WebSocket check failed",
    };
  }
}
