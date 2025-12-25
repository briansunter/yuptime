/**
 * Slack notification provider
 */

import { resolveSecret } from "../../lib/secrets";
import type { NotificationProviderConfig } from "../../types/crd";
import type { ProviderDeliveryResult } from "../types";

interface SlackMessage {
  text: string;
  blocks: Array<{
    type: string;
    text?: { type: string; text: string };
    fields?: Array<{ type: string; text: string }>;
    elements?: Array<{ type: string; text: string }>;
  }>;
}

export async function sendSlackNotification(
  config: NotificationProviderConfig,
  title: string,
  body: string,
): Promise<ProviderDeliveryResult> {
  if (!config.slack?.webhookUrlSecretRef) {
    return {
      success: false,
      error: "Slack webhook URL not configured",
    };
  }

  try {
    const webhookUrl = await resolveSecret(
      config.slack.webhookUrlSecretRef.name,
      config.slack.webhookUrlSecretRef.key,
      config.slack.webhookUrlSecretRef.namespace || "monitoring",
    );

    if (!webhookUrl) {
      return {
        success: false,
        error: "Failed to resolve Slack webhook URL",
      };
    }

    const message: SlackMessage = {
      text: title,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: title,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: body,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_Sent at ${new Date().toISOString()}_`,
            },
          ],
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
        error: `Slack API error: ${response.status} ${errorText}`,
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
