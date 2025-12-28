/**
 * Gotify notification provider
 */

import { resolveSecret } from "../../lib/secrets";
import type { NotificationProviderConfig } from "../../types/crd";
import type { ProviderDeliveryResult } from "../types";

export async function sendGotifyNotification(
  config: NotificationProviderConfig,
  title: string,
  body: string,
): Promise<ProviderDeliveryResult> {
  if (!config.gotify?.baseUrlSecretRef || !config.gotify?.tokenSecretRef) {
    return {
      success: false,
      error: "Gotify base URL or token not configured",
    };
  }

  try {
    const baseUrl = await resolveSecret(
      config.gotify.baseUrlSecretRef.name,
      config.gotify.baseUrlSecretRef.key,
      config.gotify.baseUrlSecretRef.namespace || "monitoring",
    );

    const token = await resolveSecret(
      config.gotify.tokenSecretRef.name,
      config.gotify.tokenSecretRef.key,
      config.gotify.tokenSecretRef.namespace || "monitoring",
    );

    if (!baseUrl || !token) {
      return {
        success: false,
        error: "Failed to resolve Gotify credentials",
      };
    }

    // Ensure baseUrl doesn't have trailing slash
    const url = baseUrl.replace(/\/$/, "");

    const response = await fetch(`${url}/message?token=${token}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        message: body,
        priority: title.includes("DOWN") ? 10 : 5,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Gotify error: ${response.status} ${errorText}`,
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
