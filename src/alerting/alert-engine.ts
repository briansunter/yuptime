/**
 * Alert engine - sends alerts directly to Alertmanager
 *
 * Simplified architecture:
 * - No notification providers
 * - No policy matching
 * - Direct POST to Alertmanager's /api/v1/alerts endpoint
 * - Users configure Alertmanager routing
 */

import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd/monitor";

/**
 * Send alert to Alertmanager when monitor state changes
 *
 * @param monitor - The Monitor CRD
 * @param toState - The new state ("up" or "down")
 * @param fromState - The previous state
 * @param message - Human-readable message
 */
export async function sendAlertToAlertmanager(
  monitor: Monitor,
  toState: "up" | "down" | "pending" | "flapping" | "paused",
  fromState?: string,
  message?: string,
): Promise<void> {
  const alertmanagerUrl = monitor.spec.alertmanagerUrl;

  // No Alertmanager URL configured, skip alerting
  if (!alertmanagerUrl) {
    logger.debug(
      { monitor: monitor.metadata.name },
      "No alertmanagerUrl configured, skipping alert",
    );
    return;
  }

  const monitorName = monitor.metadata.name;
  const namespace = monitor.metadata.namespace;
  const monitorId = `${namespace}/${monitorName}`;
  const reason = monitor.status?.lastResult?.reason || "Unknown";
  const latencyMs = monitor.status?.lastResult?.latencyMs;
  const monitorUrl = getMonitorUrl(monitor);

  // Build Alertmanager alert payload
  const alert = {
    receiver: "yuptime",
    alerts: [
      {
        alertname: `${namespace}_${monitorName}`,
        state: toState === "down" ? "firing" : "resolved",
        monitor: monitorName,
        namespace,
        monitorId,
        monitorType: monitor.spec.type,
        monitorUrl,
        fromState: fromState || "unknown",
        toState,
        reason,
        message:
          message ||
          `Monitor ${monitorName} is ${toState}${
            latencyMs !== undefined ? ` (${latencyMs}ms)` : ""
          }`,
        labels: {
          monitor: monitorName,
          namespace,
          state: toState,
          ...(monitor.spec.tags && { tags: monitor.spec.tags.join(",") }),
        },
        annotations: {
          summary: `${monitorName} is ${toState}`,
          description:
            message ||
            `Monitor ${monitorName} changed from ${fromState || "unknown"} to ${toState}`,
          ...(monitorUrl && { runbook_url: monitorUrl }),
        },
        generatorURL: `https://github.com/bsunt/yuptime`,
        startsAt: new Date().toISOString(),
      },
    ],
  };

  try {
    const response = await fetch(alertmanagerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(alert),
    });

    if (!response.ok) {
      const responseText = await response.text();
      logger.warn(
        {
          monitorId,
          status: response.status,
          response: responseText,
        },
        "Failed to send alert to Alertmanager",
      );
      return;
    }

    logger.info(
      { monitorId, toState, fromState, alertmanagerUrl },
      "Sent alert to Alertmanager",
    );
  } catch (error) {
    logger.warn(
      { monitorId, toState, error },
      "Failed to send alert to Alertmanager",
    );
  }
}

/**
 * Extract monitor URL for alert annotations
 */
function getMonitorUrl(monitor: Monitor): string {
  const target = monitor.spec?.target;

  if (target?.http) {
    return target.http.url;
  }
  if (target?.tcp) {
    return `${target.tcp.host}:${target.tcp.port}`;
  }
  if (target?.dns) {
    return target.dns.name;
  }
  if (target?.ping) {
    return target.ping.host;
  }
  if (target?.websocket) {
    return target.websocket.url;
  }
  if (target?.k8s) {
    return `${target.k8s.resource.kind}/${target.k8s.resource.name}`;
  }

  return "unknown";
}
