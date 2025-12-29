import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

/**
 * Ping checker - ICMP echo requests
 */
export async function checkPing(monitor: Monitor, timeout: number): Promise<CheckResult> {
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
    // Spawn a ping process
    const execFileAsync = promisify(execFile);

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
      const { stdout } = await execFileAsync(command, args, {
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
      if (stdout.toLowerCase().includes("unreachable") || stdout.includes("100% packet loss")) {
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
      const err = error as {
        killed?: boolean;
        stderr?: string;
        message?: string;
      };

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
