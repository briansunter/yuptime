import { logger } from "../../lib/logger";
import type { Condition } from "../../types/crd";
import { createCRDWatcher } from "../k8s-client";

/**
 * Update status with new conditions
 */
export async function updateStatus(
  kind: string,
  plural: string,
  namespace: string,
  name: string,
  statusUpdate: Record<string, unknown>,
) {
  const watcher = createCRDWatcher("monitoring.yuptime.io", "v1", plural);

  try {
    const patch: Array<{
      op: string;
      path: string;
      value: Record<string, unknown>;
    }> = [
      {
        op: "replace",
        path: "/status",
        value: statusUpdate,
      },
    ];

    await watcher.patchStatus(
      name,
      patch as unknown as Record<string, unknown>,
      namespace,
    );

    logger.debug({ kind, namespace, name }, `Updated ${kind} status`);
  } catch (error) {
    logger.error(
      { kind, namespace, name, error },
      `Failed to update ${kind} status`,
    );
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
    const resource = await watcher.get(name, namespace);
    let conditions: Condition[] = resource.status?.conditions || [];

    // Set Valid condition
    conditions = updateConditions(
      conditions,
      createCondition("Valid", "True", "Validated", "Resource spec is valid"),
    );

    // Set Reconciled condition
    conditions = updateConditions(
      conditions,
      createCondition(
        "Reconciled",
        "True",
        "ReconcileSuccess",
        "Resource has been reconciled",
      ),
    );

    // Set Ready condition
    conditions = updateConditions(
      conditions,
      createCondition("Ready", "True", "ResourceReady", "Resource is ready"),
    );

    const newStatus = {
      ...(resource.status || {}),
      observedGeneration: generation,
      conditions,
    };

    await updateStatus(kind, plural, namespace, name, newStatus);
  } catch (error) {
    logger.error(
      { kind, namespace, name, error },
      `Failed to mark ${kind} as valid`,
    );
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
    const resource = await watcher.get(name, namespace);
    let conditions: Condition[] = resource.status?.conditions || [];

    // Set Valid condition to False
    conditions = updateConditions(
      conditions,
      createCondition("Valid", "False", reason, message),
    );

    // Set Ready condition to False
    conditions = updateConditions(
      conditions,
      createCondition(
        "Ready",
        "False",
        "ValidationFailed",
        "Resource validation failed",
      ),
    );

    const newStatus = {
      ...(resource.status || {}),
      conditions,
    };

    await updateStatus(kind, plural, namespace, name, newStatus);

    logger.warn(
      { kind, namespace, name, reason, message },
      `Marked ${kind} as invalid`,
    );
  } catch (error) {
    logger.error(
      { kind, namespace, name, error },
      `Failed to mark ${kind} as invalid`,
    );
    throw error;
  }
}
