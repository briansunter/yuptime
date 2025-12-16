/**
 * Alert coordinator - orchestrates alert event processing end-to-end
 */

import { logger } from "../lib/logger";
import { processAlertEvent } from "./alert-engine";
import { findMatchingPolicies } from "./policy-matcher";
import { queueAlertsForDelivery } from "./delivery-engine";
import type { AlertEvent } from "./types";

/**
 * Process a single alert event through the entire pipeline
 */
export async function handleAlertEvent(event: AlertEvent): Promise<void> {
  logger.info(
    {
      monitor: `${event.monitorNamespace}/${event.monitorName}`,
      state: event.currentState,
      isStateChange: event.isStateChange,
    },
    "Processing alert event"
  );

  try {
    // Find policies that match this monitor
    const matchedPolicies = await findMatchingPolicies(
      event.monitorNamespace,
      event.monitorName
    );

    if (matchedPolicies.length === 0) {
      logger.debug(
        { monitor: `${event.monitorNamespace}/${event.monitorName}` },
        "No policies matched for monitor"
      );
      return;
    }

    // Process event through alert engine (creates incidents, determines triggers)
    const alertsToDeliver = await processAlertEvent(event, matchedPolicies);

    if (alertsToDeliver.length === 0) {
      logger.debug(
        { monitor: `${event.monitorNamespace}/${event.monitorName}` },
        "No alerts need delivery"
      );
      return;
    }

    // Queue alerts for delivery
    const queued = await queueAlertsForDelivery(alertsToDeliver);

    logger.info(
      {
        monitor: `${event.monitorNamespace}/${event.monitorName}`,
        queuedCount: queued.length,
      },
      "Alerts queued for delivery"
    );
  } catch (error) {
    logger.error(
      { monitor: `${event.monitorNamespace}/${event.monitorName}`, error },
      "Failed to process alert event"
    );
  }
}

/**
 * Start background delivery processor
 * This runs periodically to send queued notifications
 */
export function startNotificationDeliveryWorker(): NodeJS.Timer {
  logger.info("Starting notification delivery worker");

  return setInterval(async () => {
    try {
      // This will be implemented in a separate delivery worker
      // that fetches pending notifications and sends them via providers
    } catch (error) {
      logger.error({ error }, "Delivery worker error");
    }
  }, 5000); // Check every 5 seconds
}

export function stopNotificationDeliveryWorker(timer: NodeJS.Timer): void {
  logger.info("Stopping notification delivery worker");
  clearInterval(timer);
}
