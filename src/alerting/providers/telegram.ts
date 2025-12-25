/**
 * Telegram notification provider
 */

import { resolveSecret } from "../../lib/secrets";
import type { NotificationProviderConfig } from "../../types/crd";
import type { ProviderDeliveryResult } from "../types";

export async function sendTelegramNotification(
  config: NotificationProviderConfig,
  title: string,
  body: string,
): Promise<ProviderDeliveryResult> {
  if (
    !config.telegram?.botTokenSecretRef ||
    !config.telegram?.chatIdSecretRef
  ) {
    return {
      success: false,
      error: "Telegram bot token or chat ID not configured",
    };
  }

  try {
    const botToken = await resolveSecret(
      config.telegram.botTokenSecretRef.name,
      config.telegram.botTokenSecretRef.key,
      config.telegram.botTokenSecretRef.namespace || "monitoring",
    );

    const chatId = await resolveSecret(
      config.telegram.chatIdSecretRef.name,
      config.telegram.chatIdSecretRef.key,
      config.telegram.chatIdSecretRef.namespace || "monitoring",
    );

    if (!botToken || !chatId) {
      return {
        success: false,
        error: "Failed to resolve Telegram credentials",
      };
    }

    const message = `*${title}*\n\n${body}`;

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown",
        }),
      },
    );

    if (!response.ok) {
      const errorData = (await response.json()) as { description?: string };
      return {
        success: false,
        error: `Telegram API error: ${errorData.description || response.statusText}`,
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
