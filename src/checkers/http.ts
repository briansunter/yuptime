import { logger } from "../lib/logger";
import { resolveSecretCached } from "../lib/secrets";
import type { Monitor } from "../types/crd";

export interface CheckResult {
  state: "up" | "down";
  latencyMs: number;
  reason: string;
  message: string;
  certExpiresAt?: Date;
  certDaysRemaining?: number;
}

/**
 * HTTP/HTTPS monitor checker
 */
export async function checkHttp(
  monitor: Monitor,
  timeout: number,
): Promise<CheckResult> {
  const spec = monitor.spec;
  const target = spec.target.http;

  if (!target) {
    return {
      state: "down",
      latencyMs: 0,
      reason: "INVALID_CONFIG",
      message: "No HTTP target configured",
    };
  }

  try {
    const startTime = Date.now();
    const headers = new Headers();

    // Add default headers
    headers.set("User-Agent", "KubeKuma/1.0");

    // Add configured headers (with secret resolution)
    if (target.headers) {
      for (const header of target.headers) {
        let value = header.value || "";

        if (header.valueFromSecretRef) {
          try {
            value = await resolveSecretCached(
              monitor.metadata.namespace,
              header.valueFromSecretRef.name,
              header.valueFromSecretRef.key,
            );
          } catch (_error) {
            logger.warn(
              { monitor: monitor.metadata.name, header: header.name },
              "Failed to resolve header secret",
            );
          }
        }

        headers.set(header.name, value);
      }
    }

    // Prepare request body
    let body: string | undefined;
    if (target.body) {
      switch (target.body.type) {
        case "json":
          body = JSON.stringify(target.body.json || {});
          headers.set("Content-Type", "application/json");
          break;
        case "text":
          body = target.body.text;
          break;
        default:
          break;
      }
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeout * 1000);

    try {
      const response = await fetch(target.url, {
        method: target.method || "GET",
        headers,
        body,
        redirect: target.followRedirects ? "follow" : "manual",
        signal: controller.signal,
      });

      clearTimeout(timeoutHandle);
      const latencyMs = Date.now() - startTime;

      // Check status codes
      const successCriteria = spec.successCriteria?.http;
      const acceptedCodes = successCriteria?.acceptedStatusCodes || [200];

      if (!acceptedCodes.includes(response.status)) {
        return {
          state: "down",
          latencyMs,
          reason: `HTTP_${response.status}`,
          message: `HTTP ${response.status} received`,
        };
      }

      // Check content type if specified
      if (target.expectedContentType) {
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes(target.expectedContentType)) {
          return {
            state: "down",
            latencyMs,
            reason: "INVALID_CONTENT_TYPE",
            message: `Expected ${target.expectedContentType}, got ${contentType}`,
          };
        }
      }

      // Extract and validate certificate info if HTTPS
      const certInfo: { expiresAt?: Date; daysRemaining?: number } = {};
      if (target.url.startsWith("https://")) {
        // Note: fetch() doesn't expose certificate info directly
        // In a real implementation, you'd use node-fetch with custom agent
        // or use a library like node-https-proxy-agent
      }

      // Check latency if specified
      if (
        successCriteria?.latencyMsUnder &&
        latencyMs > successCriteria.latencyMsUnder
      ) {
        return {
          state: "down",
          latencyMs,
          reason: "LATENCY_EXCEEDED",
          message: `Latency ${latencyMs}ms exceeds threshold ${successCriteria.latencyMsUnder}ms`,
        };
      }

      return {
        state: "up",
        latencyMs,
        reason: "HTTP_OK",
        message: `HTTP ${response.status} OK`,
        ...certInfo,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  } catch (error) {
    const latencyMs = Date.now() - (Date.now() - Date.now()); // Simplified

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          state: "down",
          latencyMs: timeout * 1000,
          reason: "TIMEOUT",
          message: `Request timeout after ${timeout}s`,
        };
      }

      if (error.message.includes("ECONNREFUSED")) {
        return {
          state: "down",
          latencyMs,
          reason: "CONNECTION_REFUSED",
          message: "Connection refused",
        };
      }

      if (error.message.includes("ENOTFOUND")) {
        return {
          state: "down",
          latencyMs,
          reason: "DNS_NXDOMAIN",
          message: "DNS resolution failed",
        };
      }

      if (error.message.includes("certificate")) {
        return {
          state: "down",
          latencyMs,
          reason: "TLS_ERROR",
          message: error.message,
        };
      }
    }

    logger.warn(
      { monitor: monitor.metadata.name, error },
      "HTTP check failed with error",
    );

    return {
      state: "down",
      latencyMs,
      reason: "ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Execute HTTP check with keyword matching
 */
export async function checkKeyword(
  monitor: Monitor,
  timeout: number,
): Promise<CheckResult> {
  // First do the HTTP check
  const httpResult = await checkHttp(monitor, timeout);

  if (httpResult.state === "down") {
    return httpResult;
  }

  // Then check keyword criteria
  const target = monitor.spec.target.http;
  if (!target) {
    return {
      state: "down",
      latencyMs: httpResult.latencyMs,
      reason: "INVALID_CONFIG",
      message: "No HTTP target for keyword check",
    };
  }

  const criteria = monitor.spec.successCriteria?.keyword;
  if (!criteria) {
    return httpResult; // No keyword criteria, just return HTTP result
  }

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeout * 1000);

    const response = await fetch(target.url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);
    const body = await response.text();

    // Check contains
    if (criteria.contains && criteria.contains.length > 0) {
      for (const keyword of criteria.contains) {
        if (!body.includes(keyword)) {
          return {
            state: "down",
            latencyMs: httpResult.latencyMs,
            reason: "KEYWORD_MISSING",
            message: `Expected keyword "${keyword}" not found`,
          };
        }
      }
    }

    // Check notContains
    if (criteria.notContains && criteria.notContains.length > 0) {
      for (const keyword of criteria.notContains) {
        if (body.includes(keyword)) {
          return {
            state: "down",
            latencyMs: httpResult.latencyMs,
            reason: "KEYWORD_PRESENT",
            message: `Unexpected keyword "${keyword}" found`,
          };
        }
      }
    }

    // Check regex
    if (criteria.regex && criteria.regex.length > 0) {
      for (const pattern of criteria.regex) {
        try {
          const regex = new RegExp(pattern);
          if (!regex.test(body)) {
            return {
              state: "down",
              latencyMs: httpResult.latencyMs,
              reason: "REGEX_NO_MATCH",
              message: `Regex pattern "${pattern}" did not match`,
            };
          }
        } catch (_error) {
          return {
            state: "down",
            latencyMs: httpResult.latencyMs,
            reason: "INVALID_REGEX",
            message: `Invalid regex pattern: ${pattern}`,
          };
        }
      }
    }

    return httpResult;
  } catch (error) {
    logger.warn(
      { monitor: monitor.metadata.name, error },
      "Keyword check failed",
    );

    return {
      state: "down",
      latencyMs: httpResult.latencyMs,
      reason: "CHECK_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Execute HTTP check with JSON path validation
 */
export async function checkJsonQuery(
  monitor: Monitor,
  timeout: number,
): Promise<CheckResult> {
  // First do the HTTP check
  const httpResult = await checkHttp(monitor, timeout);

  if (httpResult.state === "down") {
    return httpResult;
  }

  const target = monitor.spec.target.http;
  if (!target) {
    return {
      state: "down",
      latencyMs: httpResult.latencyMs,
      reason: "INVALID_CONFIG",
      message: "No HTTP target for JSON query",
    };
  }

  const criteria = monitor.spec.successCriteria?.jsonQuery;
  if (!criteria) {
    return httpResult;
  }

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeout * 1000);

    const response = await fetch(target.url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);
    const data = await response.json();

    // Simple JSONPath implementation for basic paths
    const value = getJsonPath(data, criteria.path);

    if (criteria.exists && value === undefined) {
      return {
        state: "down",
        latencyMs: httpResult.latencyMs,
        reason: "JSON_PATH_NOT_FOUND",
        message: `JSONPath "${criteria.path}" did not exist`,
      };
    }

    if (criteria.equals !== undefined && value !== criteria.equals) {
      return {
        state: "down",
        latencyMs: httpResult.latencyMs,
        reason: "JSON_VALUE_MISMATCH",
        message: `JSONPath value "${value}" does not equal "${criteria.equals}"`,
      };
    }

    return httpResult;
  } catch (error) {
    logger.warn({ monitor: monitor.metadata.name, error }, "JSON query failed");

    return {
      state: "down",
      latencyMs: httpResult.latencyMs,
      reason: "JSON_ERROR",
      message: error instanceof Error ? error.message : "Invalid JSON response",
    };
  }
}

/**
 * Simple JSONPath getter for basic dot notation
 */
function getJsonPath(obj: any, path: string): any {
  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array index notation: $.items[0]
    const arrayMatch = part.match(/(\w+)\[(\d+)\]/);
    if (arrayMatch) {
      const key = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      current = current[key]?.[index];
    } else {
      current = current[part === "$" ? "" : part];
    }
  }

  return current;
}
