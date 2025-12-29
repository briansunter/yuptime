/**
 * MaintenanceWindow reconciler
 *
 * Manages scheduled maintenance windows with RRULE support
 */

import { logger } from "../../lib/logger";
import { getNextOccurrence, parseRRule } from "../../lib/rrule";
import type { MaintenanceWindow } from "../../types/crd";
import { MaintenanceWindowSchema } from "../../types/crd";
import type { ReconcileContext } from "./types";
import { createTypeSafeReconciler } from "./types";
import {
  typedCommonValidations,
  typedComposeValidators,
  typedValidate,
} from "./validation";

/**
 * MaintenanceWindow validators
 */
const validateWindowSchedule = (resource: MaintenanceWindow): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  if (!spec.schedule?.start || !spec.schedule?.end) {
    errors.push("spec.schedule.start and spec.schedule.end are required");
  }

  if (spec.schedule?.recurrence?.rrule) {
    // Validate RRULE format if provided
    const parsed = parseRRule(spec.schedule.recurrence.rrule);
    if (!parsed) {
      errors.push("spec.schedule.recurrence.rrule is not a valid RRULE");
    }
  }

  return errors;
};

const validateWindowMatchers = (_resource: MaintenanceWindow): string[] => {
  const errors: string[] = [];

  // No matchers field exists in the current schema
  // The match field is optional and uses SelectorSchema

  return errors;
};

const validateMaintenanceWindow = typedComposeValidators(
  typedCommonValidations.validateName,
  typedCommonValidations.validateSpec,
  validateWindowSchedule,
  validateWindowMatchers,
);

type MaintenanceWindowData = {
  namespace: string;
  name: string;
  enabled: boolean;
  schedule: {
    start: string;
    end: string;
    recurrence?:
      | {
          rrule?: string | undefined;
        }
      | undefined;
  };
  behavior?:
    | {
        suppressNotifications?: boolean | undefined;
      }
    | undefined;
  match?: {
    matchNamespaces?: string[] | undefined;
    matchLabels?:
      | {
          matchLabels?: Record<string, string> | undefined;
          matchExpressions?:
            | Array<{
                key: string;
                operator: "In" | "NotIn" | "Exists" | "DoesNotExist";
                values?: string[] | undefined;
              }>
            | undefined;
        }
      | undefined;
    matchTags?: string[];
    matchNames?: Array<{ namespace: string; name: string }>;
  };
  rrule: ReturnType<typeof parseRRule>;
  durationMinutes: number;
  nextOccurrenceAt: Date;
};

const maintenanceWindowCache = new Map<string, MaintenanceWindowData>();

const reconcileMaintenanceWindow = async (
  resource: MaintenanceWindow,
  _ctx: ReconcileContext,
) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const spec = resource.spec;

  logger.debug({ namespace, name }, "Reconciling MaintenanceWindow");

  try {
    // Calculate duration from start and end times
    const startStr = spec.schedule.start;
    const endStr = spec.schedule.end;
    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    const durationMinutes =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60);

    // Parse RRULE if provided
    let rruleConfig: ReturnType<typeof parseRRule> = null;
    let nextOccurrence: Date = startDate;

    if (spec.schedule.recurrence?.rrule) {
      const parsed = parseRRule(spec.schedule.recurrence.rrule);
      if (!parsed) {
        logger.error(
          { namespace, name, rrule: spec.schedule.recurrence.rrule },
          "Failed to parse RRULE",
        );
        throw new Error("Invalid RRULE format");
      }
      rruleConfig = parsed;

      // Calculate next occurrence
      const next = getNextOccurrence(rruleConfig, new Date());
      if (next) {
        nextOccurrence = next;
      }
    }

    // Cache maintenance window
    const windowKey = `${namespace}/${name}`;
    const windowData = {
      namespace,
      name,
      enabled: spec.enabled,
      schedule: spec.schedule,
      behavior: spec.behavior,
      match: spec.match,
      rrule: rruleConfig,
      durationMinutes,
      nextOccurrenceAt: nextOccurrence,
    };

    maintenanceWindowCache.set(windowKey, windowData);

    logger.info(
      {
        namespace,
        name,
        enabled: spec.enabled,
        nextOccurrence: nextOccurrence.toISOString(),
        duration: `${durationMinutes}m`,
      },
      "MaintenanceWindow cached",
    );

    logger.debug(
      { namespace, name },
      "MaintenanceWindow reconciliation complete",
    );
  } catch (error) {
    logger.error(
      { namespace, name, error },
      "MaintenanceWindow reconciliation failed",
    );
    throw error;
  }
};

/**
 * Check if a monitor is currently in a maintenance window
 */
export const isInMaintenanceWindow = (
  labels: Record<string, string> = {},
): boolean => {
  const now = new Date();

  for (const window of maintenanceWindowCache.values()) {
    // Check if enabled
    if (window.enabled === false) {
      continue;
    }

    // Check if current time is within window
    const windowStart = window.nextOccurrenceAt;
    const windowEnd = new Date(windowStart);
    windowEnd.setMinutes(windowEnd.getMinutes() + window.durationMinutes);

    // Simple check: is now within [windowStart, windowEnd]?
    // For more accuracy, would need to recalculate each check
    if (windowStart <= now && now < windowEnd) {
      // Check if match matches the labels
      const match = window.match;
      let matches = true;

      if (match?.matchNames && match.matchNames.length > 0) {
        // Would need name context to check
        continue;
      }

      if (match?.matchNamespaces && match.matchNamespaces.length > 0) {
        // Would need namespace context to check
        continue;
      }

      if (match?.matchLabels?.matchLabels) {
        for (const [key, expectedValue] of Object.entries(
          match.matchLabels.matchLabels,
        )) {
          if (labels[key] !== expectedValue) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Get all active maintenance windows
 */
export const getActiveMaintenanceWindows = (
  labels: Record<string, string> = {},
): Array<{
  name: string;
  schedule: {
    start: string;
    end: string;
    recurrence?:
      | {
          rrule?: string | undefined;
        }
      | undefined;
  };
  behavior?:
    | {
        suppressNotifications?: boolean | undefined;
      }
    | undefined;
  endsAt: Date;
  durationMinutes: number;
}> => {
  const activeWindows: Array<{
    name: string;
    schedule: {
      start: string;
      end: string;
      recurrence?: {
        rrule?: string;
      };
    };
    behavior?: {
      suppressNotifications?: boolean;
    };
    endsAt: Date;
    durationMinutes: number;
  }> = [];
  const now = new Date();

  for (const window of maintenanceWindowCache.values()) {
    // Check if enabled
    if (window.enabled === false) {
      continue;
    }

    // Check if current time is within window
    const windowStart = window.nextOccurrenceAt;
    const windowEnd = new Date(windowStart);
    windowEnd.setMinutes(windowEnd.getMinutes() + window.durationMinutes);

    if (windowStart <= now && now < windowEnd) {
      // Check if match matches the labels
      const match = window.match;
      let matches = true;

      if (match?.matchNames && match.matchNames.length > 0) {
        continue;
      }

      if (match?.matchNamespaces && match.matchNamespaces.length > 0) {
        continue;
      }

      if (match?.matchLabels?.matchLabels) {
        for (const [key, expectedValue] of Object.entries(
          match.matchLabels.matchLabels,
        )) {
          if (labels[key] !== expectedValue) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        activeWindows.push({
          name: window.name,
          schedule: window.schedule,
          behavior: window.behavior,
          endsAt: windowEnd,
          durationMinutes: window.durationMinutes,
        });
      }
    }
  }

  return activeWindows;
};

export const createMaintenanceWindowReconciler = () =>
  createTypeSafeReconciler<MaintenanceWindow>(
    "MaintenanceWindow",
    "maintenancewindows",
    MaintenanceWindowSchema as unknown as import("zod").ZodSchema<MaintenanceWindow>,
    {
      validator: typedValidate(validateMaintenanceWindow),
      reconciler: reconcileMaintenanceWindow,
    },
  );
