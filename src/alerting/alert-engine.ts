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
import { alertDeliveryFailedTotal } from "../lib/prometheus";
import type { Monitor } from "../types/crd/monitor";

/** Timeout for Alertmanager delivery (ms). */
const ALERT_DELIVERY_TIMEOUT_MS = 10_000;

/**
 * Increment the alert delivery failure counter.
 */
function recordDeliveryFailure(monitor: Monitor, reason: string): void {
  alertDeliveryFailedTotal.inc(
    {
      monitor: monitor.metadata.name,
      namespace: monitor.metadata.namespace,
      reason,
    },
    1,
  );
}

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
    // Allowlist schemes to prevent SSRF via non-HTTP protocols (file://, gopher://, etc.)
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(alertmanagerUrl);
    } catch {
      recordDeliveryFailure(monitor, "invalid_url");
      logger.warn({ monitorId, alertmanagerUrl }, "Invalid Alertmanager URL, skipping alert");
      return;
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      recordDeliveryFailure(monitor, "invalid_scheme");
      logger.warn(
        { monitorId, scheme: parsedUrl.protocol },
        "Alertmanager URL must be http or https, skipping alert",
      );
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ALERT_DELIVERY_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(alertmanagerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify([alert]),
        signal: controller.signal,
        // Do not follow redirects: the configured Alertmanager URL is authoritative.
        redirect: "error",
      });
    } catch (fetchError) {
      if (controller.signal.aborted) {
        recordDeliveryFailure(monitor, "timeout");
        logger.warn({ monitorId }, "Alertmanager delivery timed out");
      } else {
        recordDeliveryFailure(monitor, "network_error");
        logger.warn({ monitorId, error: fetchError }, "Failed to send alert to Alertmanager");
      }
      return;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      recordDeliveryFailure(monitor, `status_${response.status}`);
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
    recordDeliveryFailure(monitor, "unknown");
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
