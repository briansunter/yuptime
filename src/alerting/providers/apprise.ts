/**
 * Apprise notification provider
 * Generic provider supporting 100+ notification services
 */

import { resolveSecret } from "../../lib/secrets";
import type { NotificationProviderConfig } from "../../types/crd";
import type { ProviderDeliveryResult } from "../types";

export async function sendAppriseNotification(
  config: NotificationProviderConfig,
  title: string,
  body: string,
): Promise<ProviderDeliveryResult> {
  if (!config.apprise?.urlSecretRef) {
    return {
      success: false,
      error: "Apprise URL not configured",
    };
  }

  try {
    const appriseUrl = await resolveSecret(
      config.apprise.urlSecretRef.name,
      config.apprise.urlSecretRef.key,
      config.apprise.urlSecretRef.namespace || "monitoring",
    );

    if (!appriseUrl) {
      return {
        success: false,
        error: "Failed to resolve Apprise URL",
      };
    }

    // Apprise is a lightweight notification library that can be called via CLI or API
    // For API usage, we typically post to an Apprise server instance
    // This example assumes you have an Apprise server running

    const response = await fetch("http://apprise:8080/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        urls: appriseUrl,
        title,
        body,
        type: title.includes("DOWN") ? "failure" : "success",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Apprise error: ${response.status} ${errorText}`,
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
