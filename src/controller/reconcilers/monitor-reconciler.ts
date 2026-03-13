import { logger } from "../../lib/logger";
import type { Monitor } from "../../types/crd";
import { MonitorSchema } from "../../types/crd";
import { calculateJitter } from "../job-manager/jitter";
import {
  clearAll,
  getLastScheduleTime,
  isOverdue,
  recordSchedule,
  removeMonitor,
} from "../job-manager/schedule-tracker";

export { clearAll as clearScheduleTracker } from "../job-manager/schedule-tracker";

import type { JobManager } from "../job-manager/types";
import type { ReconcileContext } from "./types";
import { createTypeSafeReconciler } from "./types";
import { typedCommonValidations, typedComposeValidators, typedValidate } from "./validation";

// Safety-net interval handle
let safetyNetTimer: ReturnType<typeof setInterval> | null = null;

// Reference to job manager for safety-net rescheduling
let safetyNetJobManager: JobManager | null = null;

// Store monitors for safety-net access
const activeMonitors = new Map<string, Monitor>();

const SAFETY_NET_INTERVAL_MS = 90_000; // Check every 90s

/**
 * Monitor-specific validators
 */
const validateMonitorSchedule = (resource: Monitor): string[] => {
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

const validateMonitorTarget = (resource: Monitor): string[] => {
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
    spec.target?.k8s ||
    spec.target?.kubernetes ||
    spec.target?.mysql ||
    spec.target?.postgresql ||
    spec.target?.redis ||
    spec.target?.grpc;

  if (!hasTarget) {
    errors.push("At least one target must be configured");
  }

  // Validate target type matches monitor type
  switch (spec.type) {
    case "http":
    case "keyword":
    case "jsonQuery":
    case "xmlQuery":
    case "htmlQuery":
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
      if (!spec.target?.k8s && !spec.target?.kubernetes) {
        errors.push("Monitor type k8s requires k8s or kubernetes target");
      }
      break;
    case "mysql":
      if (!spec.target?.mysql) {
        errors.push("Monitor type mysql requires mysql target");
      }
      break;
    case "postgresql":
      if (!spec.target?.postgresql) {
        errors.push("Monitor type postgresql requires postgresql target");
      }
      break;
    case "redis":
      if (!spec.target?.redis) {
        errors.push("Monitor type redis requires redis target");
      }
      break;
    case "grpc":
      if (!spec.target?.grpc) {
        errors.push("Monitor type grpc requires grpc target");
      }
      break;
  }

  return errors;
};

/**
 * Monitor validator - composed from multiple validators
 */
const validateMonitor = typedComposeValidators(
  typedCommonValidations.validateName,
  typedCommonValidations.validateSpec,
  validateMonitorSchedule,
  validateMonitorTarget,
);

/**
 * Monitor reconciliation logic
 */
const reconcileMonitor = async (resource: Monitor, ctx: ReconcileContext) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const spec = resource.spec;

  logger.debug({ namespace, name, type: spec.type }, "Reconciling Monitor");

  // Get job manager from context
  const jobManager = ctx?.jobManager;
  if (!jobManager) {
    logger.error({ namespace, name }, "JobManager not available in reconciliation context");
    return;
  }

  // Store job manager ref for safety-net
  safetyNetJobManager = jobManager;

  // Schedule check with Job Manager if enabled
  if (spec.enabled !== false) {
    const monitorId = `${namespace}/${name}`;

    // Always store/update monitor reference for safety-net
    activeMonitors.set(monitorId, resource);

    // Start safety-net if not already running
    startSafetyNet();

    const intervalMs = (spec.schedule?.intervalSeconds || 60) * 1000;

    // Only schedule if not recently scheduled (allows recovery when overdue)
    if (getLastScheduleTime(monitorId) > 0 && !isOverdue(monitorId, intervalMs)) {
      logger.debug({ namespace, name }, "Monitor recently scheduled, skipping");
    } else {
      const intervalSeconds = spec.schedule?.intervalSeconds || 60;
      const jitterPercent = spec.schedule?.jitterPercent || 5;

      // Calculate deterministic jitter
      const jitterMs = calculateJitter(namespace, name, jitterPercent, intervalSeconds);

      // Schedule check with jitter
      scheduleMonitorCheck(jobManager, resource, monitorId, jitterMs);

      logger.debug({ namespace, name, jitterMs }, "Monitor scheduled with jitter");
    }
  } else {
    // Cancel pending jobs for disabled monitors
    try {
      await jobManager.cancelJob(namespace, name);

      // Remove from tracking
      const monitorId = `${namespace}/${name}`;
      removeMonitor(monitorId);
      activeMonitors.delete(monitorId);

      logger.info({ namespace, name }, "Monitor jobs cancelled (disabled)");
    } catch (error) {
      logger.error({ namespace, name, error }, "Failed to cancel monitor jobs");
    }
  }

  logger.debug({ namespace, name }, "Monitor reconciliation complete");
};

/**
 * Schedule a monitor check and record the time
 */
function scheduleMonitorCheck(
  jobManager: JobManager,
  monitor: Monitor,
  monitorId: string,
  delayMs: number,
) {
  // Optimistic record prevents rapid-fire duplicates during the delay window
  recordSchedule(monitorId);

  setTimeout(async () => {
    try {
      await jobManager.scheduleCheck(monitor);
      // Update to actual execution time for accurate overdue detection
      recordSchedule(monitorId);
      logger.info(
        {
          monitorId,
          type: monitor.spec.type,
          interval: monitor.spec.schedule?.intervalSeconds || 60,
        },
        "Monitor check scheduled",
      );
    } catch (error) {
      logger.error({ monitorId, error }, "Failed to schedule monitor check");
      // Remove schedule record so safety-net can retry
      removeMonitor(monitorId);
    }
  }, delayMs);
}

/**
 * Safety-net: periodically check for monitors that haven't been scheduled recently
 * and reschedule them. This catches cases where the setTimeout chain breaks.
 */
function startSafetyNet() {
  if (safetyNetTimer) {
    return;
  }

  safetyNetTimer = setInterval(() => {
    const jobManager = safetyNetJobManager;
    if (!jobManager) {
      return;
    }

    for (const [monitorId, monitor] of activeMonitors) {
      if (monitor.spec.enabled === false) {
        continue;
      }

      const intervalMs = (monitor.spec.schedule?.intervalSeconds || 60) * 1000;

      if (isOverdue(monitorId, intervalMs)) {
        const elapsed = Date.now() - getLastScheduleTime(monitorId);
        logger.warn(
          { monitorId, elapsedMs: elapsed, intervalMs },
          "Monitor overdue, safety-net rescheduling",
        );

        // Already overdue, schedule immediately (delayMs = 0)
        scheduleMonitorCheck(jobManager, monitor, monitorId, 0);
      }
    }
  }, SAFETY_NET_INTERVAL_MS);
}

/**
 * Handle monitor deletion
 */
export const handleMonitorDeletion = async (namespace: string, name: string) => {
  const monitorId = `${namespace}/${name}`;

  // Remove from all tracking
  removeMonitor(monitorId);
  activeMonitors.delete(monitorId);

  logger.debug({ namespace, name }, "Monitor deleted, removed from tracker");
};

/**
 * Stop the safety-net interval and clear all tracking state.
 * Call during controller shutdown to prevent timer leaks.
 */
export function stopSafetyNet() {
  if (safetyNetTimer) {
    clearInterval(safetyNetTimer);
    safetyNetTimer = null;
  }
  safetyNetJobManager = null;
  activeMonitors.clear();
  clearAll();
}

/**
 * Factory function to create type-safe monitor reconciler
 */
export const createMonitorReconciler = () =>
  createTypeSafeReconciler<Monitor>(
    "Monitor",
    "monitors",
    MonitorSchema as unknown as import("zod").ZodSchema<Monitor>,
    {
      validator: typedValidate(validateMonitor),
      reconciler: reconcileMonitor,
      deleteHandler: handleMonitorDeletion,
    },
  );
