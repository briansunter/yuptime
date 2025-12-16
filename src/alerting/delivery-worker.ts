/**
 * Notification delivery worker - sends queued notifications
 */

import { logger } from "../lib/logger";
import { getDatabase } from "../db";
import { crdCache, notificationDeliveries } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getPendingNotifications, markAsSent, markAsFailed } from "./delivery-engine";
import { deliverNotification } from "./providers";
import type { NotificationProvider } from "../types/crd";

/**
 * Start delivery worker loop
 */
export function startDeliveryWorker(): NodeJS.Timer {
  logger.info("Starting notification delivery worker");

  return setInterval(async () => {
    try {
      await processPendingNotifications();
    } catch (error) {
      logger.error({ error }, "Delivery worker error");
    }
  }, 5000); // Check every 5 seconds
}

export function stopDeliveryWorker(timer: NodeJS.Timer): void {
  logger.info("Stopping notification delivery worker");
  clearInterval(timer);
}

/**
 * Process all pending notifications
 */
async function processPendingNotifications(): Promise<void> {
  const pending = await getPendingNotifications(50); // Process up to 50 at a time

  if (pending.length === 0) {
    return;
  }

  logger.debug({ count: pending.length }, "Processing pending notifications");

  for (const notification of pending) {
    try {
      await deliverNotificationItem(notification);
    } catch (error) {
      logger.error(
        { notificationId: notification.id, error },
        "Failed to deliver notification"
      );
    }
  }
}

/**
 * Deliver a single notification
 */
async function deliverNotificationItem(notification: any): Promise<void> {
  const db = getDatabase();

  // Get provider from cache
  const [providerRow] = await db
    .select()
    .from(crdCache)
    .where(
      and(
        eq(crdCache.kind, "NotificationProvider"),
        eq(crdCache.name, notification.providerName)
      )
    );

  if (!providerRow) {
    logger.warn(
      { provider: notification.providerName },
      "Provider not found"
    );

    await markAsFailed(
      notification.id,
      "Provider not found in cluster"
    );
    return;
  }

  const provider = JSON.parse(providerRow.spec || "{}") as NotificationProvider;

  // Get metadata
  let metadata: any = {};
  if (notification.metadata && typeof notification.metadata === "string") {
    try {
      metadata = JSON.parse(notification.metadata);
    } catch {
      // Ignore parse errors
    }
  }

  const title = metadata.title || "KubeKuma Alert";
  const body = metadata.body || notification.metadata || "Alert triggered";

  logger.debug(
    {
      provider: notification.providerName,
      type: notification.providerType,
    },
    "Delivering notification"
  );

  try {
    const result = await deliverNotification(provider, title, body);

    if (result.success) {
      await markAsSent(notification.id, result.sentAt);
      logger.info(
        { provider: notification.providerName },
        "Notification delivered"
      );
    } else {
      await markAsFailed(notification.id, result.error || "Unknown error");
      logger.warn(
        { provider: notification.providerName, error: result.error },
        "Notification delivery failed"
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await markAsFailed(notification.id, errorMessage);
    logger.error(
      { provider: notification.providerName, error },
      "Notification delivery exception"
    );
  }
}
