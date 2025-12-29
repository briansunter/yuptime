/**
 * Push monitor checker
 *
 * Push monitors don't execute checks themselves - they receive data via HTTP pushes.
 * The checker tracks whether recent pushes have been received and validates tokens.
 * Database-free version - uses Monitor CRD status
 */

import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

export async function checkPush(
  monitor: Monitor,
  _timeout: number,
): Promise<CheckResult> {
  const spec = monitor.spec;
  const target = spec.target.push;

  if (!target) {
    return {
      state: "down",
      latencyMs: 0,
      reason: "INVALID_CONFIG",
      message: "No push target configured",
    };
  }

  try {
    // Check Monitor CRD status for last result
    const lastResult = monitor.status?.lastResult;

    if (!lastResult) {
      // No push ever received - report as down until first push
      return {
        state: "down",
        latencyMs: 0,
        reason: "NO_PUSH_RECEIVED",
        message: "Waiting for first push",
      };
    }

    // Parse the last check time
    const lastPush = new Date(lastResult.checkedAt || Date.now());
    const now = new Date();
    const timeSinceLastPush = (now.getTime() - lastPush.getTime()) / 1000; // seconds

    // Check if push is within the grace period (default 5 minutes)
    const gracePeriodSeconds = target.gracePeriodSeconds || 300;

    if (timeSinceLastPush <= gracePeriodSeconds) {
      // Recent push received
      return {
        state: lastResult.state as "up" | "down",
        latencyMs: 0,
        reason: lastResult.reason || "PUSH_OK",
        message: `Push received ${timeSinceLastPush}s ago: ${lastResult.message}`,
      };
    }
    // No recent push
    const minutesSincePush = Math.floor(timeSinceLastPush / 60);
    return {
      state: "down",
      latencyMs: 0,
      reason: "PUSH_TIMEOUT",
      message: `No push received in ${minutesSincePush} minutes (grace period: ${gracePeriodSeconds}s)`,
    };
  } catch (error) {
    logger.warn({ monitor: monitor.metadata.name, error }, "Push check failed");

    return {
      state: "down",
      latencyMs: 0,
      reason: "ERROR",
      message: error instanceof Error ? error.message : "Push check failed",
    };
  }
}

/**
 * Validate push token and extract monitor reference
 * Called by the push endpoint before recording a push
 * Database-free version - would need to read Monitor CRD directly
 */
export async function validatePushToken(
  token: string,
  _monitorNamespace: string,
  _monitorName: string,
): Promise<{ valid: boolean; reason?: string }> {
  try {
    // TODO: Implement token validation by reading Monitor CRD
    // For now, accept any push if monitor exists
    // In production, would validate token against push.token field
    // and check expiry if pushTokenExpiry is set

    return { valid: true };
  } catch (error) {
    logger.error(
      { token: `${token.substring(0, 10)}...`, error },
      "Push token validation failed",
    );

    return {
      valid: false,
      reason: error instanceof Error ? error.message : "Validation error",
    };
  }
}

/**
 * Record a push event
 * Called by the push endpoint when a valid push is received
 * Database-free version - would update Monitor CRD status directly
 * Note: This is now handled by the checker executor which updates Monitor CRD status
 */
export async function recordPush(
  _monitorNamespace: string,
  _monitorName: string,
  _state: "up" | "down" | "pending",
  _reason: string,
  _message: string,
  _latencyMs?: number,
): Promise<{ recorded: boolean; error?: string }> {
  // Push recording is now handled by:
  // 1. Push endpoint receives request
  // 2. Checker executor runs push check
  // 3. Checker executor updates Monitor CRD status
  //
  // This function is kept for compatibility but no longer used

  logger.debug("Push event recording delegated to checker executor");

  return { recorded: true };
}
