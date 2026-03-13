/**
 * Alert engine - sends alerts directly to Alertmanager
 *
 * Simplified architecture:
 * - No notification providers
 * - No policy matching
 * - Direct POST to Alertmanager's /api/v2/alerts endpoint
 * - Users configure Alertmanager routing
 */

import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd/monitor";

/**
 * Send alert to Alertmanager when monitor state changes
 *
 * Uses Alertmanager v2 API: POST array of alerts to /api/v2/alerts
 * Each alert has: labels (indexed), annotations (metadata), startsAt/endsAt, generatorURL
 * State is conveyed via endsAt: omitted = firing, set = resolved
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
  const now = new Date().toISOString();

  const descriptionText =
    message || `Monitor ${monitorName} changed from ${fromState || "unknown"} to ${toState}`;

  // Build Alertmanager v2 alert payload (array of alerts)
  const alert: Record<string, unknown> = {
    labels: {
      alertname: `yuptime_${namespace}_${monitorName}`,
      severity: toState === "down" ? "critical" : "info",
      monitor: monitorName,
      namespace,
      monitor_type: monitor.spec.type,
      source: "yuptime",
      ...(monitor.spec.tags && { tags: monitor.spec.tags.join(",") }),
    },
    annotations: {
      summary: `${monitorName} is ${toState}`,
      description: descriptionText,
      reason,
      ...(monitorUrl && { monitor_url: monitorUrl }),
      ...(latencyMs !== undefined && { latency_ms: String(latencyMs) }),
    },
    startsAt: now,
    generatorURL: "https://github.com/briansunter/yuptime",
  };

  // Alertmanager v2: resolved alerts must set endsAt
  if (toState === "up") {
    alert.endsAt = now;
  }

  try {
    const response = await fetch(alertmanagerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify([alert]),
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

    logger.info({ monitorId, toState, fromState, alertmanagerUrl }, "Sent alert to Alertmanager");
  } catch (error) {
    logger.warn({ monitorId, toState, error }, "Failed to send alert to Alertmanager");
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
  if (target?.kubernetes) {
    return `${target.kubernetes.kind}/${target.kubernetes.name}`;
  }

  return "unknown";
}
