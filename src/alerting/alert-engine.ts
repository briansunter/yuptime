/**
 * Alert engine - detects state transitions and creates incidents
 */

import { logger } from "../lib/logger";
import { getDatabase } from "../db";
import { heartbeats, incidents } from "../db/schema";
import type { AlertEvent, MatchedPolicy, AlertToDeliver } from "./types";
import { eq, and, desc, limit } from "drizzle-orm";

/**
 * Get previous heartbeat for state change detection
 */
export async function getPreviousHeartbeat(monitorId: string) {
  const db = getDatabase();
  const previous = await db
    .select()
    .from(heartbeats)
    .where(eq(heartbeats.monitorId, monitorId))
    .orderBy(desc(heartbeats.checkedAt))
    .limit(2);

  return previous.length > 1 ? previous[1] : null;
}

/**
 * Get active incident for monitor
 */
export async function getActiveIncident(monitorId: string) {
  const db = getDatabase();
  const [incident] = await db
    .select()
    .from(incidents)
    .where(
      and(eq(incidents.monitorId, monitorId), eq(incidents.state, "down"))
    )
    .limit(1);

  return incident || null;
}

/**
 * Create or close incident based on state change
 */
export async function handleIncident(
  event: AlertEvent
): Promise<{ incidentId: number; isNew: boolean }> {
  const db = getDatabase();

  if (event.currentState === "up") {
    // Close any open incident
    const active = await getActiveIncident(event.monitorId);
    if (active) {
      const now = new Date();
      const durationSeconds = Math.floor(
        (now.getTime() - new Date(active.startedAt).getTime()) / 1000
      );

      await db
        .update(incidents)
        .set({
          endedAt: now.toISOString(),
          duration: durationSeconds,
          updatedAt: now.toISOString(),
        })
        .where(eq(incidents.id, active.id));

      logger.info(
        {
          monitorId: event.monitorId,
          incidentId: active.id,
          duration: durationSeconds,
        },
        "Incident closed"
      );

      return { incidentId: active.id, isNew: false };
    }

    // No incident was open, return a virtual incident for the recovery event
    return { incidentId: -1, isNew: false };
  }

  if (event.currentState === "down") {
    // Check if incident already exists
    const active = await getActiveIncident(event.monitorId);
    if (active) {
      // Incident already exists, just return it
      return { incidentId: active.id, isNew: false };
    }

    // Create new incident
    const now = new Date();
    const result = await db
      .insert(incidents)
      .values({
        monitorNamespace: event.monitorNamespace,
        monitorName: event.monitorName,
        monitorId: event.monitorId,
        state: "down",
        startedAt: now.toISOString(),
        suppressed: false,
        acknowledged: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .returning({ id: incidents.id });

    const incidentId = result[0]?.id || 0;
    logger.info(
      { monitorId: event.monitorId, incidentId },
      "Incident created"
    );

    return { incidentId, isNew: true };
  }

  // For pending/flapping/paused states, handle as state changes
  const active = await getActiveIncident(event.monitorId);
  return { incidentId: active?.id || -1, isNew: false };
}

/**
 * Check if alert should trigger based on policy triggers
 */
export function shouldTriggerAlert(
  event: AlertEvent,
  policy: MatchedPolicy
): boolean {
  const { triggers } = policy;

  if (event.currentState === "down" && triggers.onDown) {
    return true;
  }

  if (event.currentState === "up" && triggers.onUp) {
    return true;
  }

  if (event.currentState === "flapping" && triggers.onFlapping) {
    return true;
  }

  // TODO: Handle cert expiring when monitor type is cert-check
  if (event.currentState === "up" && triggers.onCertExpiring) {
    return false; // Not yet implemented
  }

  return false;
}

/**
 * Format alert message using templates
 */
export function formatAlertMessage(
  event: AlertEvent,
  policy: MatchedPolicy
): { title: string; body: string } {
  const templates = policy.formatting || {};

  // Default templates
  const defaultTitle =
    event.currentState === "down"
      ? `🔴 ${event.monitorName} is DOWN`
      : `🟢 ${event.monitorName} is UP`;

  const defaultBody = `
Monitor: ${event.monitorName} (${event.monitorNamespace})
State: ${event.currentState.toUpperCase()}
Reason: ${event.reason}
Message: ${event.message}
Latency: ${event.latencyMs}ms
Time: ${event.timestamp.toISOString()}
  `.trim();

  const title =
    templates.titleTemplate?.replace("{monitorName}", event.monitorName) ||
    defaultTitle;

  const body =
    templates.bodyTemplate
      ?.replace("{monitorName}", event.monitorName)
      .replace("{state}", event.currentState)
      .replace("{reason}", event.reason)
      .replace("{message}", event.message)
      .replace("{latency}", event.latencyMs.toString()) ||
    defaultBody;

  return { title, body };
}

/**
 * Main alert engine: process event and determine which policies to notify
 */
export async function processAlertEvent(
  event: AlertEvent,
  matchedPolicies: MatchedPolicy[]
): Promise<AlertToDeliver[]> {
  const alertsToDeliver: AlertToDeliver[] = [];

  // Create or close incident
  const { incidentId } = await handleIncident(event);
  if (incidentId === -1) {
    // No incident to alert on (e.g., recovery but no incident was open)
    return [];
  }

  // Process each matched policy
  for (const policy of matchedPolicies) {
    // Check if policy triggers on this event type
    if (!shouldTriggerAlert(event, policy)) {
      logger.debug(
        { policy: policy.name, event: event.currentState },
        "Policy trigger condition not met"
      );
      continue;
    }

    // Format the message
    const { title, body } = formatAlertMessage(event, policy);

    // Create alert for each provider
    for (const provider of policy.providers) {
      const dedupKey = policy.dedup.key
        ? policy.dedup.key
            .replace("{monitorName}", event.monitorName)
            .replace("{monitorId}", event.monitorId)
        : `${event.monitorId}:${policy.name}`;

      alertsToDeliver.push({
        policyName: policy.name,
        providerName: provider.name,
        providerType: event.monitorName, // Will be replaced with actual type
        event,
        incidentId,
        dedupKey,
        formattedTitle: title,
        formattedBody: body,
        metadata: {
          policyPriority: policy.priority,
          dedupWindowMinutes: policy.dedup.windowMinutes,
          rateLimitMinutes: policy.rateLimit.minMinutesBetweenAlerts,
        },
      });
    }
  }

  logger.info(
    { monitorId: event.monitorId, alertCount: alertsToDeliver.length },
    "Alerts queued for delivery"
  );

  return alertsToDeliver;
}
