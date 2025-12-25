/**
 * Push monitor checker
 *
 * Push monitors don't execute checks themselves - they receive data via HTTP pushes.
 * The checker tracks whether recent pushes have been received and validates tokens.
 */

import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "../db";
import { crdCache, heartbeats } from "../db/schema";
import { logger } from "../lib/logger";
import { resolveSecretCached } from "../lib/secrets";
import type { Monitor, MonitorSpec } from "../types/crd";
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
    const db = getDatabase();
    const monitorId = `${monitor.metadata.namespace}/${monitor.metadata.name}`;

    // Get the most recent heartbeat to check if a push was received recently
    const recent = await db
      .select()
      .from(heartbeats)
      .where(eq(heartbeats.monitorId, monitorId))
      .orderBy(desc(heartbeats.checkedAt))
      .limit(1);

    if (!recent || recent.length === 0) {
      // No push ever received - report as down until first push
      return {
        state: "down",
        latencyMs: 0,
        reason: "NO_PUSH_RECEIVED",
        message: "Waiting for first push",
      };
    }

    const lastPush = new Date(recent[0].checkedAt);
    const now = new Date();
    const timeSinceLastPush = (now.getTime() - lastPush.getTime()) / 1000; // seconds

    // Check if push is within the grace period (default 5 minutes)
    const gracePeriodSeconds = target.gracePeriodSeconds || 300;

    if (timeSinceLastPush <= gracePeriodSeconds) {
      // Recent push received
      return {
        state: recent[0].state as "up" | "down",
        latencyMs: 0,
        reason: recent[0].reason || "PUSH_OK",
        message: `Push received ${timeSinceLastPush}s ago: ${recent[0].message}`,
      };
    } else {
      // No recent push
      const minutesSincePush = Math.floor(timeSinceLastPush / 60);
      return {
        state: "down",
        latencyMs: 0,
        reason: "PUSH_TIMEOUT",
        message: `No push received in ${minutesSincePush} minutes (grace period: ${gracePeriodSeconds}s)`,
      };
    }
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
 *
 * Token validation:
 * 1. Monitor must exist and be of type "push"
 * 2. Token must match the one stored in the Kubernetes Secret
 * 3. Uses timing-safe comparison to prevent timing attacks
 */
export async function validatePushToken(
  token: string,
  monitorNamespace: string,
  monitorName: string,
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const db = getDatabase();

    // Verify the monitor exists
    const monitorRows = await db
      .select()
      .from(crdCache)
      .where(
        and(
          eq(crdCache.kind, "Monitor"),
          eq(crdCache.namespace, monitorNamespace),
          eq(crdCache.name, monitorName),
        ),
      );

    if (!monitorRows || monitorRows.length === 0) {
      return {
        valid: false,
        reason: "Monitor not found",
      };
    }

    const spec: MonitorSpec = JSON.parse(monitorRows[0].spec || "{}");

    // Check if monitor is push type
    if (spec.type !== "push") {
      return {
        valid: false,
        reason: "Monitor is not a push type",
      };
    }

    // Check if push target has token secret reference
    const pushTarget = spec.target?.push;
    if (!pushTarget?.tokenSecretRef) {
      return {
        valid: false,
        reason: "Push monitor missing tokenSecretRef configuration",
      };
    }

    // Resolve the expected token from Kubernetes Secret
    let expectedToken: string;
    try {
      expectedToken = await resolveSecretCached(
        monitorNamespace,
        pushTarget.tokenSecretRef.name,
        pushTarget.tokenSecretRef.key,
      );
    } catch (error) {
      logger.error(
        {
          monitorNamespace,
          monitorName,
          secretRef: pushTarget.tokenSecretRef,
          error,
        },
        "Failed to resolve push token secret",
      );
      return {
        valid: false,
        reason: "Failed to resolve token secret",
      };
    }

    // Use timing-safe comparison to prevent timing attacks
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expectedToken);

    // Lengths must match for timingSafeEqual
    if (tokenBuffer.length !== expectedBuffer.length) {
      return {
        valid: false,
        reason: "Invalid token",
      };
    }

    const isValid = crypto.timingSafeEqual(tokenBuffer, expectedBuffer);

    if (!isValid) {
      logger.warn(
        { monitorNamespace, monitorName },
        "Push token validation failed - token mismatch",
      );
      return {
        valid: false,
        reason: "Invalid token",
      };
    }

    return { valid: true };
  } catch (error) {
    logger.error(
      {
        token: token.length > 10 ? `${token.substring(0, 10)}...` : "[short]",
        error,
      },
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
 */
export async function recordPush(
  monitorNamespace: string,
  monitorName: string,
  state: "up" | "down" | "pending",
  reason: string,
  message: string,
  latencyMs?: number,
): Promise<{ recorded: boolean; error?: string }> {
  try {
    const db = getDatabase();

    const monitorId = `${monitorNamespace}/${monitorName}`;

    // Record as heartbeat
    await db.insert(heartbeats).values({
      monitorNamespace,
      monitorName,
      monitorId,
      state,
      latencyMs: latencyMs || 0,
      reason,
      message: message.substring(0, 500), // Truncate long messages
      checkedAt: new Date().toISOString(),
      attempts: 1,
    });

    logger.debug({ monitor: monitorId, state }, "Push event recorded");

    return { recorded: true };
  } catch (error) {
    logger.error({ error }, "Failed to record push");

    return {
      recorded: false,
      error: error instanceof Error ? error.message : "Recording failed",
    };
  }
}
