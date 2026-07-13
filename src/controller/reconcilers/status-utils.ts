import { logger } from "../../lib/logger";
import type { Condition } from "../../types/crd";
import { createCRDWatcher } from "../k8s-client";

type ResourceWithStatus = {
  status?: Record<string, unknown> & {
    conditions?: Condition[];
  };
};

type JsonPatchOp = {
  op: "add";
  path: string;
  value: unknown;
};

/**
 * Build a JSON Patch that updates only the status fields owned by
 * reconciliation (conditions, observedGeneration).
 *
 * Targets the `/status` subresource: the patch is applied to the full
 * resource object, so paths reference the top-level `status` field. Uses
 * `add` operations so missing members are created and existing object
 * members are replaced (RFC 6902 §4.1). Never copies `lastResult`,
 * `previousResult`, or other fields written by the checker executor —
 * replacing `/status` wholesale would race that writer and clobber the
 * latest check result (TOCTOU).
 */
function buildOwnedStatusPatch(
  statusExists: boolean,
  conditions: Condition[],
  observedGeneration?: number,
): JsonPatchOp[] {
  // Status absent: create it seeded with only the fields we own.
  if (!statusExists) {
    const initial: Record<string, unknown> = { conditions };
    if (observedGeneration !== undefined) {
      initial.observedGeneration = observedGeneration;
    }
    return [{ op: "add", path: "/status", value: initial }];
  }

  const ops: JsonPatchOp[] = [{ op: "add", path: "/status/conditions", value: conditions }];
  if (observedGeneration !== undefined) {
    ops.push({ op: "add", path: "/status/observedGeneration", value: observedGeneration });
  }
  return ops;
}

/**
 * Patch only reconciliation-owned status fields (conditions, observedGeneration).
 * Sends a JSON Patch to the `/status` subresource.
 */
async function patchOwnedStatus(
  kind: string,
  plural: string,
  namespace: string,
  name: string,
  patch: JsonPatchOp[],
): Promise<void> {
  const watcher = createCRDWatcher("monitoring.yuptime.io", "v1", plural);

  try {
    await watcher.patchStatus(name, patch as unknown as Record<string, unknown>, namespace);
    logger.debug({ kind, namespace, name }, `Updated ${kind} status`);
  } catch (error) {
    logger.error({ kind, namespace, name, error }, `Failed to update ${kind} status`);
    throw error;
  }
}

/**
 * Create or update a condition in status
 */
export const createCondition = (
  type: string,
  status: "True" | "False" | "Unknown",
  reason?: string,
  message?: string,
): Condition => ({
  type,
  status,
  reason,
  message,
  lastTransitionTime: new Date().toISOString(),
});

/**
 * Update or add condition to conditions array
 */
export const updateConditions = (
  conditions: Condition[] = [],
  newCondition: Condition,
): Condition[] => {
  const now = new Date().toISOString();
  const existing = conditions.findIndex((c) => c.type === newCondition.type);

  const conditionToAdd: Condition = {
    ...newCondition,
    lastTransitionTime: newCondition.lastTransitionTime || now,
  };

  if (existing >= 0) {
    // Only update transition time if status changed
    const prev = conditions[existing];
    if (prev && prev.status !== newCondition.status) {
      conditionToAdd.lastTransitionTime = now;
    } else if (prev) {
      conditionToAdd.lastTransitionTime = prev.lastTransitionTime;
    }
    conditions[existing] = conditionToAdd;
  } else {
    conditions.push(conditionToAdd);
  }

  return conditions;
};

/**
 * Mark resource as valid and reconciled
 */
export async function markValid(
  kind: string,
  plural: string,
  namespace: string,
  name: string,
  generation: number,
) {
  const watcher = createCRDWatcher("monitoring.yuptime.io", "v1", plural);

  try {
    const resource = (await watcher.get(name, namespace)) as ResourceWithStatus;
    const statusExists = typeof resource.status === "object" && resource.status !== null;
    let conditions: Condition[] = resource.status?.conditions || [];

    // Set Valid condition
    conditions = updateConditions(
      conditions,
      createCondition("Valid", "True", "Validated", "Resource spec is valid"),
    );

    // Set Reconciled condition
    conditions = updateConditions(
      conditions,
      createCondition("Reconciled", "True", "ReconcileSuccess", "Resource has been reconciled"),
    );

    // Set Ready condition
    conditions = updateConditions(
      conditions,
      createCondition("Ready", "True", "ResourceReady", "Resource is ready"),
    );

    const patch = buildOwnedStatusPatch(statusExists, conditions, generation);
    await patchOwnedStatus(kind, plural, namespace, name, patch);
  } catch (error) {
    logger.error({ kind, namespace, name, error }, `Failed to mark ${kind} as valid`);
    throw error;
  }
}

/**
 * Mark resource as invalid
 */
export async function markInvalid(
  kind: string,
  plural: string,
  namespace: string,
  name: string,
  reason: string,
  message: string,
) {
  const watcher = createCRDWatcher("monitoring.yuptime.io", "v1", plural);

  try {
    const resource = (await watcher.get(name, namespace)) as ResourceWithStatus;
    const statusExists = typeof resource.status === "object" && resource.status !== null;
    let conditions: Condition[] = resource.status?.conditions || [];

    // Set Valid condition to False
    conditions = updateConditions(conditions, createCondition("Valid", "False", reason, message));

    // Set Ready condition to False
    conditions = updateConditions(
      conditions,
      createCondition("Ready", "False", "ValidationFailed", "Resource validation failed"),
    );

    const patch = buildOwnedStatusPatch(statusExists, conditions);
    await patchOwnedStatus(kind, plural, namespace, name, patch);

    logger.warn({ kind, namespace, name, reason, message }, `Marked ${kind} as invalid`);
  } catch (error) {
    logger.error({ kind, namespace, name, error }, `Failed to mark ${kind} as invalid`);
    throw error;
  }
}
