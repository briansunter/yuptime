import { logger } from "../../lib/logger";
import { StatusPageSchema, MaintenanceWindowSchema } from "../../types/crd";
import type { ReconcilerConfig, CRDResource } from "./types";
import {
  commonValidations,
  createZodValidator,
  composeValidators,
  validate,
  validateRange,
  validateDateRange,
} from "./validation";

/**
 * StatusPage validators
 */
const validateStatusPageSlug = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const slug = resource.spec.slug;

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    errors.push("spec.slug must be a valid slug (lowercase alphanumeric and hyphens)");
  }

  return errors;
};

const validateGroups = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const groups = resource.spec.groups;

  if (!groups || groups.length === 0) {
    errors.push("spec.groups must have at least one group");
    return errors;
  }

  const groupNames = new Set<string>();

  for (const group of groups) {
    if (!group.name) {
      errors.push("Each group must have a name");
      continue;
    }

    if (groupNames.has(group.name)) {
      errors.push(`Duplicate group name: ${group.name}`);
    }
    groupNames.add(group.name);

    if (!group.monitors || group.monitors.length === 0) {
      errors.push(`Group "${group.name}" must have at least one monitor`);
    }
  }

  return errors;
};

const validateStatusPage = composeValidators(
  commonValidations.validateName,
  commonValidations.validateSpec,
  createZodValidator(StatusPageSchema),
  validateStatusPageSlug,
  validateGroups
);

const reconcileStatusPage = async (resource: CRDResource) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const spec = resource.spec;

  logger.debug({ namespace, name }, "Reconciling StatusPage");

  try {
    // Verify all referenced monitors exist
    const { crdCache } = require("../../db/schema");
    const db = require("../../db").getDatabase();
    const { eq, and } = require("drizzle-orm");

    const missingMonitors: string[] = [];

    if (spec.groups && Array.isArray(spec.groups)) {
      for (const group of spec.groups) {
        for (const monitorRef of group.monitors || []) {
          const monitor = await db
            .select()
            .from(crdCache)
            .where(
              and(
                eq(crdCache.kind, "Monitor"),
                eq(crdCache.namespace, monitorRef.ref.namespace),
                eq(crdCache.name, monitorRef.ref.name)
              )
            );

          if (!monitor || monitor.length === 0) {
            missingMonitors.push(
              `${monitorRef.ref.namespace}/${monitorRef.ref.name}`
            );
          }
        }
      }
    }

    if (missingMonitors.length > 0) {
      logger.warn(
        { namespace, name, missingMonitors },
        "StatusPage references non-existent monitors"
      );
    }

    // Count monitors
    const monitorCount = (spec.groups || []).reduce(
      (sum, group) => sum + (group.monitors?.length || 0),
      0
    );

    // Update crd_cache
    await db
      .update(crdCache)
      .set({
        status: missingMonitors.length === 0 ? "valid" : "warning",
        lastReconcile: new Date().toISOString(),
      })
      .where(
        and(
          eq(crdCache.kind, "StatusPage"),
          eq(crdCache.namespace, namespace),
          eq(crdCache.name, name)
        )
      );

    logger.info(
      {
        namespace,
        name,
        slug: spec.slug,
        monitorCount,
        published: spec.published,
      },
      "StatusPage reconciliation complete"
    );
  } catch (error) {
    logger.error(
      { namespace, name, error },
      "StatusPage reconciliation failed"
    );
    throw error;
  }
};

/**
 * MaintenanceWindow validators
 */
const validateMaintenanceSchedule = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  if (spec.schedule?.start && spec.schedule?.end) {
    errors.push(
      ...validateDateRange(
        spec.schedule.start,
        spec.schedule.end,
        "spec.schedule.start",
        "spec.schedule.end"
      )
    );
  }

  return errors;
};

const validateMaintenanceWindow = composeValidators(
  commonValidations.validateName,
  commonValidations.validateSpec,
  createZodValidator(MaintenanceWindowSchema),
  validateMaintenanceSchedule
);

const reconcileMaintenanceWindow = async (resource: CRDResource) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;

  logger.debug({ namespace, name }, "Reconciling MaintenanceWindow");

  // TODO: Parse RRULE
  // TODO: Calculate next occurrence
  // TODO: Cache maintenance windows

  logger.debug({ namespace, name }, "MaintenanceWindow reconciliation complete");
};

export const createStatusPageReconciler = (): ReconcilerConfig => ({
  kind: "StatusPage",
  plural: "statuspages",
  zodSchema: StatusPageSchema,
  validator: validate(validateStatusPage),
  reconciler: reconcileStatusPage,
});

export const createMaintenanceWindowReconciler = (): ReconcilerConfig => ({
  kind: "MaintenanceWindow",
  plural: "maintenancewindows",
  zodSchema: MaintenanceWindowSchema,
  validator: validate(validateMaintenanceWindow),
  reconciler: reconcileMaintenanceWindow,
});
