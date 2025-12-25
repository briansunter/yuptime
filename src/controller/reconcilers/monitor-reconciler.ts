import { logger } from "../../lib/logger";
import { scheduler } from "../../scheduler";
import { MonitorSchema } from "../../types/crd";
import type { CRDResource, ReconcileContext, ReconcilerConfig } from "./types";
import {
  commonValidations,
  composeValidators,
  createZodValidator,
  validate,
} from "./validation";

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
  _ctx: ReconcileContext,
) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const spec = resource.spec;

  logger.debug({ namespace, name, type: spec.type }, "Reconciling Monitor");

  // Register with scheduler if enabled
  if (spec.enabled !== false) {
    const jobId = `${namespace}/${name}`;
    const intervalSeconds = spec.schedule?.intervalSeconds || 60;
    const timeoutSeconds = spec.schedule?.timeoutSeconds || 30;

    scheduler.register({
      id: jobId,
      namespace,
      name,
      nextRunAt: new Date(), // Run immediately
      intervalSeconds,
      timeoutSeconds,
      priority: 0, // Default priority
    });

    logger.info(
      { namespace, name, type: spec.type, interval: intervalSeconds },
      "Monitor registered with scheduler",
    );
  } else {
    // Unregister disabled monitors
    const jobId = `${namespace}/${name}`;
    scheduler.unregister(jobId);
    logger.info(
      { namespace, name },
      "Monitor unregistered from scheduler (disabled)",
    );
  }

  logger.debug({ namespace, name }, "Monitor reconciliation complete");
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
