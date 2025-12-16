/**
 * Webhook notification provider
 */

import { resolveSecret } from "../../lib/secrets";
import type { NotificationProviderConfig } from "../../types/crd";
import type { ProviderDeliveryResult } from "../types";

export async function sendWebhookNotification(
  config: NotificationProviderConfig,
  title: string,
  body: string
): Promise<ProviderDeliveryResult> {
  if (!config.webhook?.urlSecretRef) {
    return {
      success: false,
      error: "Webhook URL not configured",
    };
  }

  try {
    const url = await resolveSecret(
      config.webhook.urlSecretRef.name,
      config.webhook.urlSecretRef.key,
      config.webhook.urlSecretRef.namespace || "monitoring"
    );

    if (!url) {
      return {
        success: false,
        error: "Failed to resolve webhook URL",
      };
    }

    const method = config.webhook.method || "POST";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add custom headers
    if (config.webhook.headers) {
      for (const header of config.webhook.headers) {
        if (header.value) {
          headers[header.name] = header.value;
        } else if (header.valueFromSecretRef) {
          const value = await resolveSecret(
            header.valueFromSecretRef.name,
            header.valueFromSecretRef.key,
            header.valueFromSecretRef.namespace || "monitoring"
          );
          if (value) {
            headers[header.name] = value;
          }
        }
      }
    }

    const payload = {
      title,
      body,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Webhook error: ${response.status} ${errorText}`,
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
