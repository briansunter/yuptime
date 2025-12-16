/**
 * MaintenanceWindow reconciler
 *
 * Manages scheduled maintenance windows with RRULE support
 */

import { logger } from "../../lib/logger";
import { MaintenanceWindowSchema } from "../../types/crd";
import { parseRRule, getNextOccurrence } from "../../lib/rrule";
import type { ReconcilerConfig, CRDResource } from "./types";
import {
  commonValidations,
  createZodValidator,
  composeValidators,
  validate,
} from "./validation";

/**
 * MaintenanceWindow validators
 */
const validateWindowSchedule = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  if (!spec.schedule?.recurrence) {
    errors.push("spec.schedule.recurrence (RRULE) is required");
  } else {
    // Validate RRULE format
    const parsed = parseRRule(spec.schedule.recurrence);
    if (!parsed) {
      errors.push("spec.schedule.recurrence is not a valid RRULE");
    }
  }

  if (!spec.schedule?.duration) {
    errors.push("spec.schedule.duration is required (e.g., '2h', '30m')");
  } else {
    // Validate duration format
    if (!/^\d+[mh]$/.test(spec.schedule.duration)) {
      errors.push("spec.schedule.duration must be in format: '30m' or '2h'");
    }
  }

  return errors;
};

const validateWindowMatchers = (resource: CRDResource): string[] => {
  const errors: string[] = [];

  if (resource.spec.matchers && resource.spec.matchers.length === 0) {
    errors.push("spec.matchers must have at least one matcher");
  }

  return errors;
};

const validateMaintenanceWindow = composeValidators(
  commonValidations.validateName,
  commonValidations.validateSpec,
  createZodValidator(MaintenanceWindowSchema),
  validateWindowSchedule,
  validateWindowMatchers
);

const maintenanceWindowCache = new Map<string, any>();

/**
 * Parse duration string to minutes
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([mh])$/);
  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = match[2];

  return unit === "h" ? value * 60 : value;
}

const reconcileMaintenanceWindow = async (resource: CRDResource) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const spec = resource.spec;

  logger.debug({ namespace, name }, "Reconciling MaintenanceWindow");

  try {
    // Parse RRULE
    const rruleConfig = parseRRule(spec.schedule.recurrence);
    if (!rruleConfig) {
      logger.error(
        { namespace, name, rrule: spec.schedule.recurrence },
        "Failed to parse RRULE"
      );
      throw new Error("Invalid RRULE format");
    }

    // Calculate duration in minutes
    const durationMinutes = parseDuration(spec.schedule.duration);
    if (durationMinutes === 0) {
      logger.error(
        { namespace, name, duration: spec.schedule.duration },
        "Failed to parse duration"
      );
      throw new Error("Invalid duration format");
    }

    // Calculate next occurrence
    const nextOccurrence = getNextOccurrence(rruleConfig, new Date());

    // Cache maintenance window
    const windowKey = `${namespace}/${name}`;
    const windowData = {
      namespace,
      name,
      description: spec.description,
      rrule: rruleConfig,
      durationMinutes,
      matchers: spec.matchers || [],
      nextOccurrenceAt: nextOccurrence,
    };

    maintenanceWindowCache.set(windowKey, windowData);

    logger.info(
      {
        namespace,
        name,
        nextOccurrence: nextOccurrence?.toISOString(),
        duration: `${durationMinutes}m`,
      },
      "MaintenanceWindow cached"
    );

    // Update crd_cache status
    const { crdCache } = require("../../db/schema");
    const db = require("../../db").getDatabase();
    const { eq, and } = require("drizzle-orm");

    await db
      .update(crdCache)
      .set({
        lastReconcile: new Date().toISOString(),
      })
      .where(
        and(
          eq(crdCache.kind, "MaintenanceWindow"),
          eq(crdCache.namespace, namespace),
          eq(crdCache.name, name)
        )
      );

    logger.debug(
      { namespace, name },
      "MaintenanceWindow reconciliation complete"
    );
  } catch (error) {
    logger.error(
      { namespace, name, error },
      "MaintenanceWindow reconciliation failed"
    );
    throw error;
  }
};

/**
 * Check if a monitor is currently in a maintenance window
 */
export const isInMaintenanceWindow = (
  labels: Record<string, string> = {}
): boolean => {
  const now = new Date();

  for (const window of maintenanceWindowCache.values()) {
    // Check if current time is within window
    const windowStart = window.nextOccurrenceAt;
    const windowEnd = new Date(windowStart);
    windowEnd.setMinutes(windowEnd.getMinutes() + window.durationMinutes);

    // Simple check: is now within [windowStart, windowEnd]?
    // For more accuracy, would need to recalculate each check
    if (windowStart <= now && now < windowEnd) {
      // Check if matchers match the labels
      let matches = true;
      for (const matcher of window.matchers) {
        if (matcher.name && labels[matcher.name] !== matcher.value) {
          matches = false;
          break;
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
  labels: Record<string, string> = {}
): any[] => {
  const activeWindows: any[] = [];

  for (const window of maintenanceWindowCache.values()) {
    // Check if current time is within window
    const now = new Date();
    const windowStart = window.nextOccurrenceAt;
    const windowEnd = new Date(windowStart);
    windowEnd.setMinutes(windowEnd.getMinutes() + window.durationMinutes);

    if (windowStart <= now && now < windowEnd) {
      // Check if matchers match the labels
      let matches = true;
      for (const matcher of window.matchers) {
        if (matcher.name && labels[matcher.name] !== matcher.value) {
          matches = false;
          break;
        }
      }

      if (matches) {
        activeWindows.push({
          name: window.name,
          description: window.description,
          endsAt: windowEnd,
          durationMinutes: window.durationMinutes,
        });
      }
    }
  }

  return activeWindows;
};

export const createMaintenanceWindowReconciler = (): ReconcilerConfig => ({
  kind: "MaintenanceWindow",
  plural: "maintenancewindows",
  zodSchema: MaintenanceWindowSchema,
  validator: validate(validateMaintenanceWindow),
  reconciler: reconcileMaintenanceWindow,
});
