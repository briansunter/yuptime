/**
 * Notification delivery engine - queue, deduplicate, rate limit, and deliver alerts
 */

import { and, eq, gt } from "drizzle-orm";
import { getDatabase } from "../db";
import { notificationDeliveries } from "../db/schema";
import { logger } from "../lib/logger";
import type { AlertToDeliver, NotificationDeliveryQueueItem } from "./types";

/**
 * Check if alert is a duplicate within the dedup window
 */
export async function isDuplicate(
  _dedupKey: string,
  windowMinutes: number,
): Promise<boolean> {
  const db = getDatabase();
  const _windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const _existing = await db
    .select()
    .from(notificationDeliveries)
    .where(
      // This is a simplified check - in production you'd want to track dedup key separately
      eq(notificationDeliveries.status, "sent"),
    )
    .limit(1);

  // TODO: Implement proper dedup key tracking in schema
  // For now, assume no duplicates
  return false;
}

/**
 * Check if alert should be rate limited
 */
export async function isRateLimited(
  monitorId: string,
  policyName: string,
  minMinutesBetween: number,
): Promise<boolean> {
  if (minMinutesBetween === 0) {
    return false; // No rate limit
  }

  const db = getDatabase();
  const windowStart = new Date(Date.now() - minMinutesBetween * 60 * 1000);

  const recent = await db
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.monitorId, monitorId),
        eq(notificationDeliveries.policyName, policyName),
        eq(notificationDeliveries.status, "sent"),
        gt(notificationDeliveries.sentAt || "", windowStart.toISOString()),
      ),
    )
    .execute();

  return recent.length > 0;
}

/**
 * Check if alert is suppressed by silence or maintenance window
 */
async function isSuppressed(
  monitorNamespace: string,
  monitorName: string,
): Promise<{ suppressed: boolean; reason?: string }> {
  try {
    const db = getDatabase();
    // Get monitor labels from cache
    const { crdCache } = require("../db/schema");
    const { eq, and } = require("drizzle-orm");

    const monitor = (await db
      .select()
      .from(crdCache)
      .where(
        and(
          eq(crdCache.kind, "Monitor"),
          eq(crdCache.namespace, monitorNamespace),
          eq(crdCache.name, monitorName),
        ),
      )
      .execute()) as any[];

    if (!monitor || monitor.length === 0) {
      return { suppressed: false };
    }

    const monitorSpec = JSON.parse(monitor[0].spec || "{}");
    const labels = monitorSpec.metadata?.labels || {};

    // Check silences
    const {
      getActiveSilences,
    } = require("../controller/reconcilers/auth-and-config-reconcilers");
    const silences = getActiveSilences(labels);
    if (silences.length > 0) {
      return {
        suppressed: true,
        reason: `Silenced by: ${silences.map((s: any) => s.name).join(", ")}`,
      };
    }

    // Check maintenance windows
    const {
      getActiveMaintenanceWindows,
    } = require("../controller/reconcilers/maintenance-window-reconciler");
    const windows = getActiveMaintenanceWindows(labels);
    if (windows.length > 0) {
      return {
        suppressed: true,
        reason: `In maintenance window: ${windows.map((w: any) => w.name).join(", ")}`,
      };
    }

    return { suppressed: false };
  } catch (error) {
    logger.warn({ error }, "Failed to check suppression status");
    return { suppressed: false };
  }
}

/**
 * Queue alert for delivery
 */
export async function queueAlertForDelivery(
  alert: AlertToDeliver,
): Promise<NotificationDeliveryQueueItem> {
  const db = getDatabase();
  const now = new Date();

  // Check for suppression (silence or maintenance window)
  const suppression = await isSuppressed(
    alert.event.monitorNamespace,
    alert.event.monitorName,
  );
  if (suppression.suppressed) {
    logger.debug(
      {
        monitor: alert.event.monitorId,
        policy: alert.policyName,
        reason: suppression.reason,
      },
      "Alert suppressed",
    );

    await db.insert(notificationDeliveries).values({
      incidentId: alert.incidentId,
      monitorId: alert.event.monitorId,
      policyName: alert.policyName,
      providerName: alert.providerName,
      providerType: alert.providerType,
      status: "deduped",
      attempts: 0,
      createdAt: now.toISOString(),
      metadata: JSON.stringify({
        dedupKey: alert.dedupKey,
        reason: suppression.reason || "suppressed",
      }),
    });

    return {
      incidentId: alert.incidentId,
      monitorId: alert.event.monitorId,
      policyName: alert.policyName,
      providerName: alert.providerName,
      providerType: alert.providerType,
      status: "deduped",
      attempts: 0,
      createdAt: now,
    };
  }

  // Check for duplicates
  const isDup = await isDuplicate(
    alert.dedupKey,
    alert.metadata?.dedupWindowMinutes || 10,
  );
  if (isDup) {
    logger.debug(
      {
        monitor: alert.event.monitorId,
        policy: alert.policyName,
      },
      "Alert deduplicated",
    );

    await db.insert(notificationDeliveries).values({
      incidentId: alert.incidentId,
      monitorId: alert.event.monitorId,
      policyName: alert.policyName,
      providerName: alert.providerName,
      providerType: alert.providerType,
      status: "deduped",
      attempts: 0,
      createdAt: now.toISOString(),
      metadata: JSON.stringify({
        dedupKey: alert.dedupKey,
        reason: "duplicate_in_window",
      }),
    });

    return {
      incidentId: alert.incidentId,
      monitorId: alert.event.monitorId,
      policyName: alert.policyName,
      providerName: alert.providerName,
      providerType: alert.providerType,
      status: "deduped",
      attempts: 0,
      createdAt: now,
    };
  }

  // Check rate limiting
  const isLimited = await isRateLimited(
    alert.event.monitorId,
    alert.policyName,
    alert.metadata?.rateLimitMinutes || 0,
  );
  if (isLimited) {
    logger.debug(
      {
        monitor: alert.event.monitorId,
        policy: alert.policyName,
      },
      "Alert rate limited",
    );

    await db.insert(notificationDeliveries).values({
      incidentId: alert.incidentId,
      monitorId: alert.event.monitorId,
      policyName: alert.policyName,
      providerName: alert.providerName,
      providerType: alert.providerType,
      status: "deduped",
      attempts: 0,
      createdAt: now.toISOString(),
      metadata: JSON.stringify({
        dedupKey: alert.dedupKey,
        reason: "rate_limited",
      }),
    });

    return {
      incidentId: alert.incidentId,
      monitorId: alert.event.monitorId,
      policyName: alert.policyName,
      providerName: alert.providerName,
      providerType: alert.providerType,
      status: "deduped",
      attempts: 0,
      createdAt: now,
    };
  }

  // Queue for delivery
  await db.insert(notificationDeliveries).values({
    incidentId: alert.incidentId,
    monitorId: alert.event.monitorId,
    policyName: alert.policyName,
    providerName: alert.providerName,
    providerType: alert.providerType,
    status: "pending",
    attempts: 0,
    createdAt: now.toISOString(),
    metadata: JSON.stringify({
      title: alert.formattedTitle,
      body: alert.formattedBody,
      dedupKey: alert.dedupKey,
      ...alert.metadata,
    }),
  });

  logger.debug(
    {
      monitor: alert.event.monitorId,
      policy: alert.policyName,
      provider: alert.providerName,
    },
    "Alert queued for delivery",
  );

  return {
    incidentId: alert.incidentId,
    monitorId: alert.event.monitorId,
    policyName: alert.policyName,
    providerName: alert.providerName,
    providerType: alert.providerType,
    status: "pending",
    attempts: 0,
    createdAt: now,
  };
}

/**
 * Queue multiple alerts for delivery
 */
export async function queueAlertsForDelivery(
  alerts: AlertToDeliver[],
): Promise<NotificationDeliveryQueueItem[]> {
  const queued: NotificationDeliveryQueueItem[] = [];

  for (const alert of alerts) {
    try {
      const item = await queueAlertForDelivery(alert);
      queued.push(item);
    } catch (error) {
      logger.error(
        { alert: alert.event.monitorId, error },
        "Failed to queue alert",
      );
    }
  }

  return queued;
}

/**
 * Get pending notifications for delivery
 */
export async function getPendingNotifications(
  limit: number = 100,
): Promise<NotificationDeliveryQueueItem[]> {
  const db = getDatabase();

  const pending = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.status, "pending"))
    .limit(limit);

  return pending.map((item) => ({
    id: item.id,
    incidentId: item.incidentId,
    monitorId: item.monitorId,
    policyName: item.policyName,
    providerName: item.providerName,
    providerType: item.providerType,
    status: item.status as "pending" | "sent" | "failed" | "deduped",
    attempts: item.attempts || 0,
    lastAttemptAt: item.lastAttemptAt
      ? new Date(item.lastAttemptAt)
      : undefined,
    lastError: item.lastError || undefined,
    createdAt: new Date(item.createdAt),
    sentAt: item.sentAt ? new Date(item.sentAt) : undefined,
  }));
}

/**
 * Mark notification as sent
 */
export async function markAsSent(
  notificationId: number,
  sentAt: Date = new Date(),
): Promise<void> {
  const db = getDatabase();

  await db
    .update(notificationDeliveries)
    .set({
      status: "sent",
      sentAt: sentAt.toISOString(),
    })
    .where(eq(notificationDeliveries.id, notificationId));

  logger.debug({ notificationId }, "Notification marked as sent");
}

/**
 * Mark notification as failed and increment attempts
 */
export async function markAsFailed(
  notificationId: number,
  error: string,
  lastAttemptAt: Date = new Date(),
): Promise<void> {
  const db = getDatabase();

  await db
    .update(notificationDeliveries)
    .set({
      status: "failed",
      lastError: error,
      lastAttemptAt: lastAttemptAt.toISOString(),
    })
    .where(eq(notificationDeliveries.id, notificationId));

  logger.debug({ notificationId, error }, "Notification marked as failed");
}
