/**
 * Policy matcher - routes monitors to notification policies based on selectors
 */

import { and, eq } from "drizzle-orm";
import { getDatabase } from "../db";
import { crdCache } from "../db/schema";
import { logger } from "../lib/logger";
import type {
  NotificationPolicy,
  NotificationPolicySpec,
  Selector,
} from "../types/crd";
import type { MatchedPolicy } from "./types";

/**
 * Load all active notification policies from cache
 */
export async function loadAllPolicies(): Promise<NotificationPolicy[]> {
  const db = getDatabase();

  const rows = await db
    .select()
    .from(crdCache)
    .where(eq(crdCache.kind, "NotificationPolicy"));

  return rows.map((row) => JSON.parse(row.spec || "{}") as NotificationPolicy);
}

/**
 * Match labels/tags against selector
 * Supports matchLabels, matchNamespaces, matchTags, and matchNames
 */
function matchesSelector(
  labels: Record<string, string> | undefined,
  selector: Selector | undefined,
  namespace?: string,
  name?: string,
): boolean {
  if (!selector) {
    // No selector matches all
    return true;
  }

  // Check namespace matches
  if (selector.matchNamespaces && selector.matchNamespaces.length > 0) {
    if (!namespace || !selector.matchNamespaces.includes(namespace)) {
      return false;
    }
  }

  // Check name matches
  if (selector.matchNames && selector.matchNames.length > 0) {
    const nameMatch = selector.matchNames.some(
      (m) => m.namespace === namespace && m.name === name,
    );
    if (!nameMatch) {
      return false;
    }
  }

  // Check label matches
  if (selector.matchLabels?.matchLabels) {
    if (!labels) {
      return false;
    }
    for (const [key, expectedValue] of Object.entries(
      selector.matchLabels.matchLabels,
    )) {
      if (labels[key] !== expectedValue) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Find all policies that match a monitor
 */
export async function findMatchingPolicies(
  monitorNamespace: string,
  monitorName: string,
  monitorLabels?: Record<string, string>,
): Promise<MatchedPolicy[]> {
  const _db = getDatabase();
  const allPolicies = await loadAllPolicies();
  const matched: MatchedPolicy[] = [];

  for (const policy of allPolicies) {
    const spec = policy.spec as NotificationPolicySpec;

    // Check if selector matches
    if (spec.match) {
      const selectorMatches = matchesSelector(
        monitorLabels,
        spec.match,
        monitorNamespace,
        monitorName,
      );
      if (!selectorMatches) {
        continue;
      }
    }

    // Load provider refs to get full provider details
    const providers: Array<{ name: string; namespace: string }> = [];

    for (const providerRef of spec.routing?.providers || []) {
      providers.push({
        name: providerRef.ref.name,
        namespace: monitorNamespace, // Assume same namespace unless specified
      });
    }

    matched.push({
      namespace: policy.metadata.namespace,
      name: policy.metadata.name,
      priority: spec.priority || 50,
      providers,
      triggers: {
        onDown: spec.triggers?.onDown !== false,
        onUp: spec.triggers?.onUp !== false,
        onFlapping: spec.triggers?.onFlapping !== false,
        onCertExpiring: spec.triggers?.onCertExpiring !== false,
      },
      dedup: {
        key: spec.routing?.dedupe?.key,
        windowMinutes: spec.routing?.dedupe?.windowMinutes || 10,
      },
      rateLimit: {
        minMinutesBetweenAlerts:
          spec.routing?.rateLimit?.minMinutesBetweenAlerts || 0,
      },
      resend: {
        resendIntervalMinutes: spec.routing?.resend?.resendIntervalMinutes || 0,
      },
      formatting: spec.formatting,
    });
  }

  // Sort by priority (higher priority first)
  matched.sort((a, b) => b.priority - a.priority);

  logger.debug(
    {
      monitor: `${monitorNamespace}/${monitorName}`,
      matchCount: matched.length,
    },
    "Policies matched",
  );

  return matched;
}

/**
 * Build routing cache for a monitor
 * Called by policy reconciler
 */
export async function buildRoutingTable(
  monitorNamespace: string,
  monitorName: string,
): Promise<MatchedPolicy[]> {
  // Get monitor from cache to extract labels
  const db = getDatabase();

  const [monitor] = (await db
    .select()
    .from(crdCache)
    .where(
      and(
        eq(crdCache.kind, "Monitor"),
        eq(crdCache.namespace, monitorNamespace),
        eq(crdCache.name, monitorName),
      ),
    )
    .execute()) as any[];

  if (!monitor) {
    logger.warn(
      { monitor: `${monitorNamespace}/${monitorName}` },
      "Monitor not found for routing",
    );
    return [];
  }

  const monitorSpec = JSON.parse(monitor.spec || "{}");
  const labels = monitorSpec.metadata?.labels || {};

  return findMatchingPolicies(monitorNamespace, monitorName, labels);
}
