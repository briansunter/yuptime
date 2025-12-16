/**
 * Discord notification provider
 */

import { logger } from "../../lib/logger";
import { resolveSecret } from "../../lib/secrets";
import type { NotificationProviderConfig } from "../../types/crd";
import type { ProviderDeliveryResult } from "../types";

export async function sendDiscordNotification(
  config: NotificationProviderConfig,
  title: string,
  body: string
): Promise<ProviderDeliveryResult> {
  if (!config.discord?.webhookUrlSecretRef) {
    return {
      success: false,
      error: "Discord webhook URL not configured",
    };
  }

  try {
    const webhookUrl = await resolveSecret(
      config.discord.webhookUrlSecretRef.name,
      config.discord.webhookUrlSecretRef.key,
      config.discord.webhookUrlSecretRef.namespace || "monitoring"
    );

    if (!webhookUrl) {
      return {
        success: false,
        error: "Failed to resolve Discord webhook URL",
      };
    }

    const message = {
      embeds: [
        {
          title,
          description: body,
          color: title.includes("DOWN") ? 0xff0000 : 0x00ff00,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Discord API error: ${response.status} ${errorText}`,
      };
    }

    return {
      success: true,
      sentAt: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
