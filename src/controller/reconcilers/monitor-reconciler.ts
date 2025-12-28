import { logger } from "../../lib/logger";
import { MonitorSchema } from "../../types/crd";
import type { JobManager } from "../job-manager";
import { calculateJitter } from "../job-manager/jitter";
import type { CRDResource, ReconcileContext, ReconcilerConfig } from "./types";
import {
  commonValidations,
  composeValidators,
  createZodValidator,
  validate,
} from "./validation";

// Track which monitors have been scheduled to prevent duplicates
const scheduledMonitors = new Set<string>();

/**
 * Monitor-specific validators
 */
const validateMonitorSchedule = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  if (!spec.schedule) return errors;

  if (spec.schedule.timeoutSeconds >= spec.schedule.intervalSeconds) {
    errors.push(
      "schedule.timeoutSeconds must be less than schedule.intervalSeconds",
    );
  }

  if (spec.schedule.intervalSeconds < 20) {
    errors.push("schedule.intervalSeconds must be at least 20 seconds");
  }

  return errors;
};

const validateMonitorTarget = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  const hasTarget =
    spec.target?.http ||
    spec.target?.tcp ||
    spec.target?.dns ||
    spec.target?.ping ||
    spec.target?.websocket ||
    spec.target?.push ||
    spec.target?.steam ||
    spec.target?.k8s;

  if (!hasTarget) {
    errors.push("At least one target must be configured");
  }

  // Validate target type matches monitor type
  switch (spec.type) {
    case "http":
    case "keyword":
    case "jsonQuery":
      if (!spec.target?.http) {
        errors.push(`Monitor type ${spec.type} requires http target`);
      }
      break;
    case "tcp":
      if (!spec.target?.tcp) {
        errors.push("Monitor type tcp requires tcp target");
      }
      break;
    case "dns":
      if (!spec.target?.dns) {
        errors.push("Monitor type dns requires dns target");
      }
      break;
    case "ping":
      if (!spec.target?.ping) {
        errors.push("Monitor type ping requires ping target");
      }
      break;
    case "websocket":
      if (!spec.target?.websocket) {
        errors.push("Monitor type websocket requires websocket target");
      }
      break;
    case "push":
      if (!spec.target?.push) {
        errors.push("Monitor type push requires push target");
      }
      break;
    case "steam":
      if (!spec.target?.steam) {
        errors.push("Monitor type steam requires steam target");
      }
      break;
    case "k8s":
      if (!spec.target?.k8s) {
        errors.push("Monitor type k8s requires k8s target");
      }
      break;
  }

  return errors;
};

/**
 * Monitor validator - composed from multiple validators
 */
const validateMonitor = composeValidators(
  commonValidations.validateName,
  commonValidations.validateSpec,
  createZodValidator(MonitorSchema),
  validateMonitorSchedule,
  validateMonitorTarget,
);

/**
 * Monitor reconciliation logic
 */
const reconcileMonitor = async (
  resource: CRDResource,
  ctx: ReconcileContext,
) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const spec = resource.spec;

  logger.debug({ namespace, name, type: spec.type }, "Reconciling Monitor");

  // Get job manager from context
  const jobManager = ctx?.jobManager as JobManager;
  if (!jobManager) {
    logger.error(
      { namespace, name },
      "JobManager not available in reconciliation context",
    );
    return;
  }

  // Schedule check with Job Manager if enabled
  if (spec.enabled !== false) {
    const monitorId = `${namespace}/${name}`;

    // Only schedule if this monitor hasn't been scheduled yet
    if (!scheduledMonitors.has(monitorId)) {
      const intervalSeconds = spec.schedule?.intervalSeconds || 60;
      const jitterPercent = spec.schedule?.jitterPercent || 5;

      // Calculate deterministic jitter
      const jitterMs = calculateJitter(
        namespace,
        name,
        jitterPercent,
        intervalSeconds,
      );

      // Schedule first check with jitter
      setTimeout(async () => {
        try {
          await jobManager.scheduleCheck(resource as any); // Cast to Monitor type
          logger.info(
            { namespace, name, type: spec.type, interval: intervalSeconds },
            "Monitor check scheduled",
          );
        } catch (error) {
          logger.error(
            { namespace, name, error },
            "Failed to schedule monitor check",
          );
        }
      }, jitterMs);

      // Mark as scheduled
      scheduledMonitors.add(monitorId);

      logger.debug(
        { namespace, name, jitterMs },
        "Monitor scheduled with jitter",
      );
    } else {
      logger.debug({ namespace, name }, "Monitor already scheduled, skipping");
    }
  } else {
    // Cancel pending jobs for disabled monitors
    try {
      await jobManager.cancelJob(namespace, name);

      // Remove from scheduled set so it can be rescheduled if re-enabled
      const monitorId = `${namespace}/${name}`;
      scheduledMonitors.delete(monitorId);

      logger.info({ namespace, name }, "Monitor jobs cancelled (disabled)");
    } catch (error) {
      logger.error({ namespace, name, error }, "Failed to cancel monitor jobs");
    }
  }

  logger.debug({ namespace, name }, "Monitor reconciliation complete");
};

/**
 * Handle monitor deletion
 */
export const handleMonitorDeletion = async (
  namespace: string,
  name: string,
) => {
  const monitorId = `${namespace}/${name}`;

  // Remove from scheduled set
  scheduledMonitors.delete(monitorId);

  logger.debug(
    { namespace, name },
    "Monitor deleted, removed from scheduled set",
  );
};

/**
 * Factory function to create monitor reconciler with error handling
 */
export const createMonitorReconciler = (): ReconcilerConfig => ({
  kind: "Monitor",
  plural: "monitors",
  zodSchema: MonitorSchema,
  validator: validate(validateMonitor),
  reconciler: reconcileMonitor,
});
