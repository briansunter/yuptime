/**
 * Pushover notification provider
 */

import { resolveSecret } from "../../lib/secrets";
import type { NotificationProviderConfig } from "../../types/crd";
import type { ProviderDeliveryResult } from "../types";

export async function sendPushoverNotification(
  config: NotificationProviderConfig,
  title: string,
  body: string,
): Promise<ProviderDeliveryResult> {
  if (
    !config.pushover?.userKeySecretRef ||
    !config.pushover?.apiTokenSecretRef
  ) {
    return {
      success: false,
      error: "Pushover user key or API token not configured",
    };
  }

  try {
    const userKey = await resolveSecret(
      config.pushover.userKeySecretRef.name,
      config.pushover.userKeySecretRef.key,
      config.pushover.userKeySecretRef.namespace || "monitoring",
    );

    const apiToken = await resolveSecret(
      config.pushover.apiTokenSecretRef.name,
      config.pushover.apiTokenSecretRef.key,
      config.pushover.apiTokenSecretRef.namespace || "monitoring",
    );

    let device: string | undefined;
    if (config.pushover.deviceSecretRef) {
      device = await resolveSecret(
        config.pushover.deviceSecretRef.name,
        config.pushover.deviceSecretRef.key,
        config.pushover.deviceSecretRef.namespace || "monitoring",
      );
    }

    if (!userKey || !apiToken) {
      return {
        success: false,
        error: "Failed to resolve Pushover credentials",
      };
    }

    const priority = title.includes("DOWN") ? 1 : 0;
    const sound = title.includes("DOWN") ? "alarm_siren" : "cashregister";

    const params = new URLSearchParams({
      user: userKey,
      token: apiToken,
      title,
      message: body,
      priority: priority.toString(),
      sound,
    });

    if (device) {
      params.append("device", device);
    }

    const response = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    if (!response.ok) {
      const errorData = (await response.json()) as { errors?: string[] };
      return {
        success: false,
        error: `Pushover error: ${errorData.errors?.[0] || response.statusText}`,
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
