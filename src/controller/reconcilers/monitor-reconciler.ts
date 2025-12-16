import { logger } from "../../lib/logger";
import { MonitorSchema } from "../../types/crd";
import type { ReconcilerConfig, CRDResource, ReconcileContext } from "./types";
import {
  commonValidations,
  createZodValidator,
  composeValidators,
  validate,
} from "./validation";
import { markValid, markInvalid } from "./status-utils";

/**
 * Monitor-specific validators
 */
const validateMonitorSchedule = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  if (!spec.schedule) return errors;

  if (spec.schedule.timeoutSeconds >= spec.schedule.intervalSeconds) {
    errors.push("schedule.timeoutSeconds must be less than schedule.intervalSeconds");
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
  validateMonitorTarget
);

/**
 * Monitor reconciliation logic
 */
const reconcileMonitor = async (resource: CRDResource, ctx: ReconcileContext) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;

  logger.debug({ namespace, name, type: resource.spec.type }, "Reconciling Monitor");

  // TODO: Register with scheduler
  // This will be implemented in Phase 3 when scheduler is created

  logger.debug({ namespace, name }, "Monitor reconciliation complete");
};

/**
 * Factory function to create monitor reconciler with error handling
 */
export const createMonitorReconciler = (
  statusUpdater: typeof markValid
): ReconcilerConfig => ({
  kind: "Monitor",
  plural: "monitors",
  zodSchema: MonitorSchema,
  validator: validate(validateMonitor),
  reconciler: reconcileMonitor,
});
