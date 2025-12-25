/**
 * Notification provider dispatch
 */

import { logger } from "../../lib/logger";
import type {
  NotificationProvider,
  NotificationProviderConfig,
} from "../../types/crd";
import type { ProviderDeliveryResult } from "../types";
import { sendAppriseNotification } from "./apprise";
import { sendDiscordNotification } from "./discord";
import { sendGotifyNotification } from "./gotify";
import { sendPushoverNotification } from "./pushover";
import { sendSlackNotification } from "./slack";
import { sendSmtpNotification } from "./smtp";
import { sendTelegramNotification } from "./telegram";
import { sendWebhookNotification } from "./webhook";

/**
 * Send notification via provider
 */
export async function deliverNotification(
  provider: NotificationProvider,
  title: string,
  body: string,
): Promise<ProviderDeliveryResult> {
  const type = provider.spec.type;
  const config = provider.spec.config as NotificationProviderConfig;

  if (!provider.spec.enabled) {
    return {
      success: false,
      error: "Provider is disabled",
    };
  }

  try {
    switch (type) {
      case "slack":
        return await sendSlackNotification(config, title, body);

      case "discord":
        return await sendDiscordNotification(config, title, body);

      case "telegram":
        return await sendTelegramNotification(config, title, body);

      case "smtp":
        return await sendSmtpNotification(config, title, body);

      case "webhook":
        return await sendWebhookNotification(config, title, body);

      case "gotify":
        return await sendGotifyNotification(config, title, body);

      case "pushover":
        return await sendPushoverNotification(config, title, body);

      case "apprise":
        return await sendAppriseNotification(config, title, body);

      default:
        return {
          success: false,
          error: `Unknown provider type: ${type}`,
        };
    }
  } catch (error) {
    logger.error(
      { provider: provider.metadata.name, error },
      "Provider delivery failed",
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export type { ProviderDeliveryResult };
