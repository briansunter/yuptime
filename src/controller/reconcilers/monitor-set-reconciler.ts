import { logger } from "../../lib/logger";
import type { MonitorSet } from "../../types/crd";
import { MonitorSetSchema } from "../../types/crd";
import type { ReconcileContext } from "./types";
import { createTypeSafeReconciler } from "./types";
import {
  typedCommonValidations,
  typedComposeValidators,
  typedValidate,
  validateNonEmptyArray,
  validateUniqueField,
} from "./validation";

/**
 * MonitorSet-specific validators
 */
const validateMonitorSetItems = (resource: MonitorSet): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  // Check items not empty
  errors.push(...validateNonEmptyArray("spec.items", spec.items || []));

  // Check names are unique and valid
  if (spec.items) {
    errors.push(
      ...validateUniqueField("item.name", spec.items, (item) => item.name),
    );

    for (const item of spec.items) {
      if (!item.name || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(item.name)) {
        errors.push(`Invalid item name: ${item.name}`);
      }
    }
  }

  return errors;
};

/**
 * MonitorSet validator
 */
const validateMonitorSet = typedComposeValidators(
  typedCommonValidations.validateName,
  typedCommonValidations.validateSpec,
  validateMonitorSetItems,
);

/**
 * MonitorSet reconciliation
 */
const reconcileMonitorSet = async (
  resource: MonitorSet,
  _ctx: ReconcileContext,
) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const itemCount = resource.spec.items?.length;

  logger.debug({ namespace, name, itemCount }, "Reconciling MonitorSet");

  // TODO: Register each monitor item with scheduler (inline mode)

  logger.debug(
    { namespace, name, itemCount },
    "MonitorSet reconciliation complete",
  );
};

export const createMonitorSetReconciler = () =>
  createTypeSafeReconciler<MonitorSet>(
    "MonitorSet",
    "monitorsets",
    MonitorSetSchema as unknown as import("zod").ZodSchema<MonitorSet>,
    {
      validator: typedValidate(validateMonitorSet),
      reconciler: reconcileMonitorSet,
    },
  );
