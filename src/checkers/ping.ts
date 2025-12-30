import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

/**
 * Result from executing a ping command
 */
export interface PingExecResult {
  stdout: string;
  stderr?: string;
}

/**
 * Error thrown when ping command fails
 */
export interface PingExecError extends Error {
  killed?: boolean;
  stderr?: string;
}

/**
 * Executor function for running ping commands
 * Allows dependency injection for testing
 */
export type PingExecutor = (
  command: string,
  args: string[],
  options: { timeout: number },
) => Promise<PingExecResult>;

/**
 * Default executor using Node.js child_process.execFile
 */
async function defaultExecutor(
  command: string,
  args: string[],
  options: { timeout: number },
): Promise<PingExecResult> {
  const execFileAsync = promisify(execFile);
  return await execFileAsync(command, args, options);
}

/**
 * Internal ping checker implementation with injectable executor
 */
async function checkPingWithExecutor(
  monitor: Monitor,
  timeout: number,
  executor: PingExecutor,
): Promise<CheckResult> {
  const spec = monitor.spec;
  const target = spec.target.ping;

  if (!target) {
    return {
      state: "down",
      latencyMs: 0,
      reason: "INVALID_CONFIG",
      message: "No ping target configured",
    };
  }

  const startTime = Date.now();

  try {
    const packetCount = target.packetCount || 1;
    const host = target.host;

    // Determine platform and build ping command
    const command = "ping";
    let args: string[] = [];

    const platform = process.platform;
    if (platform === "win32") {
      // Windows
      args = ["-n", packetCount.toString(), "-w", (timeout * 1000).toString(), host];
    } else {
      // Linux/macOS
      args = ["-c", packetCount.toString(), "-W", timeout.toString(), host];
    }

    try {
      const { stdout } = await executor(command, args, {
        timeout: timeout * 1000,
      });

      const latencyMs = Date.now() - startTime;

      // Parse the output to extract latency
      // This is platform-dependent, so we'll do a simple regex search
      const timeRegex = /time[=<]\s*([\d.]+)\s*ms/i;
      const match = stdout.match(timeRegex);

      if (match) {
        const latencyStr = match[1];
        if (!latencyStr) {
          return {
            state: "down",
            latencyMs,
            reason: "PARSE_ERROR",
            message: "Failed to parse ping output",
          };
        }
        const pingLatency = parseFloat(latencyStr);
        return {
          state: "up",
          latencyMs: Math.round(pingLatency),
          reason: "PING_OK",
          message: `Ping successful with latency ${pingLatency}ms`,
        };
      }

      // If we can't parse latency, just check for success indicators
      // Note: Use regex for packet loss check due to Bun bug with includes("%")
      if (stdout.toLowerCase().includes("unreachable") || /100\.0%?\s*packet loss/i.test(stdout)) {
        return {
          state: "down",
          latencyMs,
          reason: "PING_UNREACHABLE",
          message: "Host unreachable or all packets lost",
        };
      }

      return {
        state: "up",
        latencyMs,
        reason: "PING_OK",
        message: "Ping successful",
      };
    } catch (error: unknown) {
      const latencyMs = Date.now() - startTime;

      // Type narrow to access error properties
      const err = error as PingExecError;

      if (err.killed) {
        return {
          state: "down",
          latencyMs,
          reason: "TIMEOUT",
          message: `Ping timeout after ${timeout}s`,
        };
      }

      // Check stderr for common error messages
      const stderr = err.stderr || "";
      if (stderr.includes("unknown host") || stderr.includes("Name or service not known")) {
        return {
          state: "down",
          latencyMs,
          reason: "DNS_NXDOMAIN",
          message: "Host not found",
        };
      }

      if (stderr.includes("Unreachable") || stderr.includes("No route")) {
        return {
          state: "down",
          latencyMs,
          reason: "UNREACHABLE",
          message: "Host unreachable",
        };
      }

      return {
        state: "down",
        latencyMs,
        reason: "PING_ERROR",
        message: stderr || err.message || "Ping check failed",
      };
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.warn({ monitor: monitor.metadata.name, error }, "Ping check failed");

    return {
      state: "down",
      latencyMs,
      reason: "ERROR",
      message: error instanceof Error ? error.message : "Ping check failed",
    };
  }
}

/**
 * Ping checker - ICMP echo requests
 */
export async function checkPing(monitor: Monitor, timeout: number): Promise<CheckResult> {
  return checkPingWithExecutor(monitor, timeout, defaultExecutor);
}

/**
 * Create a ping checker with a custom executor (for testing)
 */
export function createCheckPing(
  executor: PingExecutor,
): (monitor: Monitor, timeout: number) => Promise<CheckResult> {
  return (monitor: Monitor, timeout: number) => checkPingWithExecutor(monitor, timeout, executor);
}
