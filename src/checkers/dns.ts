import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

/**
 * DNS resolution checker
 */
export async function checkDns(
  monitor: Monitor,
  _timeout: number,
): Promise<CheckResult> {
  const spec = monitor.spec;
  const target = spec.target.dns;

  if (!target) {
    return {
      state: "down",
      latencyMs: 0,
      reason: "INVALID_CONFIG",
      message: "No DNS target configured",
    };
  }

  const startTime = Date.now();

  try {
    const dns = require("node:dns").promises;

    // Determine which DNS lookup to use based on record type
    let results: string[] = [];

    switch (target.recordType || "A") {
      case "A":
      case "AAAA": {
        const addresses = await dns.resolve(
          target.name,
          target.recordType || "A",
        );
        results = addresses;
        break;
      }

      case "CNAME": {
        const cnames = await dns.resolveCname(target.name);
        results = cnames;
        break;
      }

      case "MX": {
        const mxRecords = await dns.resolveMx(target.name);
        results = mxRecords.map((mx: any) => mx.exchange);
        break;
      }

      case "TXT": {
        const txtRecords = await dns.resolveTxt(target.name);
        results = txtRecords.flat().map((txt) => txt.toString());
        break;
      }

      case "SRV": {
        const srvRecords = await dns.resolveSrv(target.name);
        results = srvRecords.map((srv: any) => `${srv.name}:${srv.port}`);
        break;
      }

      default:
        return {
          state: "down",
          latencyMs: Date.now() - startTime,
          reason: "INVALID_RECORD_TYPE",
          message: `Unsupported DNS record type: ${target.recordType}`,
        };
    }

    const latencyMs = Date.now() - startTime;

    if (results.length === 0) {
      return {
        state: "down",
        latencyMs,
        reason: "DNS_EMPTY_RESPONSE",
        message: `DNS query returned no results for ${target.recordType || "A"}`,
      };
    }

    // If expected values are configured, check them
    if (target.expected?.values && target.expected.values.length > 0) {
      const hasMatch = target.expected.values.some((expected) =>
        results.some(
          (result) => result === expected || result.includes(expected),
        ),
      );

      if (!hasMatch) {
        return {
          state: "down",
          latencyMs,
          reason: "DNS_VALUE_MISMATCH",
          message: `Expected values not found. Got: ${results.join(", ")}`,
        };
      }
    }

    return {
      state: "up",
      latencyMs,
      reason: "DNS_OK",
      message: `DNS resolution successful. Results: ${results.join(", ")}`,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error instanceof Error) {
      if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("NXDOMAIN")
      ) {
        return {
          state: "down",
          latencyMs,
          reason: "DNS_NXDOMAIN",
          message: `DNS name not found: ${target.name}`,
        };
      }

      if (
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("ETIMEOUT")
      ) {
        return {
          state: "down",
          latencyMs,
          reason: "DNS_TIMEOUT",
          message: "DNS query timed out",
        };
      }

      return {
        state: "down",
        latencyMs,
        reason: "DNS_ERROR",
        message: error.message,
      };
    }

    logger.warn({ monitor: monitor.metadata.name, error }, "DNS check failed");

    return {
      state: "down",
      latencyMs,
      reason: "ERROR",
      message: "DNS check failed",
    };
  }
}
