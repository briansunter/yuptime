import { logger } from "../../lib/logger";
import { resetMonitorMetrics } from "../../lib/prometheus";
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

// Pending one-shot schedules keyed by namespace/name.
const pendingScheduleTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

type Target = NonNullable<Monitor["spec"]["target"]>;

const TARGET_REQUIREMENTS: Partial<Record<Monitor["spec"]["type"], (target: Target) => boolean>> = {
  http: (t) => Boolean(t.http),
  keyword: (t) => Boolean(t.http),
  jsonQuery: (t) => Boolean(t.http),
  xmlQuery: (t) => Boolean(t.http),
  htmlQuery: (t) => Boolean(t.http),
  tcp: (t) => Boolean(t.tcp),
  dns: (t) => Boolean(t.dns),
  ping: (t) => Boolean(t.ping),
  websocket: (t) => Boolean(t.websocket),
  push: (t) => Boolean(t.push),
  steam: (t) => Boolean(t.steam),
  k8s: (t) => Boolean(t.k8s || t.kubernetes),
  mysql: (t) => Boolean(t.mysql),
  postgresql: (t) => Boolean(t.postgresql),
  redis: (t) => Boolean(t.redis),
  grpc: (t) => Boolean(t.grpc),
};

const TARGET_REQUIREMENT_MESSAGE: Partial<Record<Monitor["spec"]["type"], string>> = {
  http: "Monitor type http requires http target",
  keyword: "Monitor type keyword requires http target",
  jsonQuery: "Monitor type jsonQuery requires http target",
  xmlQuery: "Monitor type xmlQuery requires http target",
  htmlQuery: "Monitor type htmlQuery requires http target",
  tcp: "Monitor type tcp requires tcp target",
  dns: "Monitor type dns requires dns target",
  ping: "Monitor type ping requires ping target",
  websocket: "Monitor type websocket requires websocket target",
  push: "Monitor type push requires push target",
  steam: "Monitor type steam requires steam target",
  k8s: "Monitor type k8s requires k8s or kubernetes target",
  mysql: "Monitor type mysql requires mysql target",
  postgresql: "Monitor type postgresql requires postgresql target",
  redis: "Monitor type redis requires redis target",
  grpc: "Monitor type grpc requires grpc target",
};

function hasAnyTarget(target: Target | undefined): boolean {
  if (!target) return false;
  return Boolean(
    target.http ||
      target.tcp ||
      target.dns ||
      target.ping ||
      target.websocket ||
      target.push ||
      target.steam ||
      target.k8s ||
      target.kubernetes ||
      target.mysql ||
      target.postgresql ||
      target.redis ||
      target.grpc,
  );
}

const validateMonitorTarget = (resource: Monitor): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  if (!hasAnyTarget(spec.target)) {
    errors.push("At least one target must be configured");
  }

  const requirement = TARGET_REQUIREMENTS[spec.type];
  if (requirement && spec.target && !requirement(spec.target)) {
    const message = TARGET_REQUIREMENT_MESSAGE[spec.type];
    if (message) errors.push(message);
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
  if (spec.enabled === false) {
    // Cancel pending jobs for disabled monitors
    try {
      await jobManager.cancelJob(namespace, name);

      // Remove from tracking
      const monitorId = `${namespace}/${name}`;
      clearPendingSchedule(monitorId);
      removeMonitor(monitorId);
      activeMonitors.delete(monitorId);

      logger.info({ namespace, name }, "Monitor jobs cancelled (disabled)");
    } catch (error) {
      logger.error({ namespace, name, error }, "Failed to cancel monitor jobs");
    }
  } else {
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
      scheduleMonitorCheck(jobManager, monitorId, jitterMs);

      logger.debug({ namespace, name, jitterMs }, "Monitor scheduled with jitter");
    }
  }

  logger.debug({ namespace, name }, "Monitor reconciliation complete");
};

/**
 * Schedule a monitor check and record the time
 */
function scheduleMonitorCheck(jobManager: JobManager, monitorId: string, delayMs: number) {
  clearPendingSchedule(monitorId);

  // Optimistic record prevents rapid-fire duplicates during the delay window
  recordSchedule(monitorId);

  const timer = setTimeout(async () => {
    pendingScheduleTimers.delete(monitorId);

    const latestMonitor = activeMonitors.get(monitorId);
    if (!latestMonitor || latestMonitor.spec.enabled === false) {
      removeMonitor(monitorId);
      logger.info({ monitorId }, "Skipped pending monitor schedule because monitor is inactive");
      return;
    }

    try {
      await jobManager.scheduleCheck(latestMonitor);
      // Update to actual execution time for accurate overdue detection
      recordSchedule(monitorId);
      logger.info(
        {
          monitorId,
          type: latestMonitor.spec.type,
          interval: latestMonitor.spec.schedule?.intervalSeconds || 60,
        },
        "Monitor check scheduled",
      );
    } catch (error) {
      logger.error({ monitorId, error }, "Failed to schedule monitor check");
      // Remove schedule record so safety-net can retry
      removeMonitor(monitorId);
    }
  }, delayMs);

  pendingScheduleTimers.set(monitorId, timer);
}

function clearPendingSchedule(monitorId: string) {
  const pendingTimer = pendingScheduleTimers.get(monitorId);
  if (!pendingTimer) {
    return;
  }

  clearTimeout(pendingTimer);
  pendingScheduleTimers.delete(monitorId);
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
        scheduleMonitorCheck(jobManager, monitorId, 0);
      }
    }
  }, SAFETY_NET_INTERVAL_MS);
}

/**
 * Handle monitor deletion
 */
export const handleMonitorDeletion = (namespace: string, name: string): Promise<void> => {
  const monitorId = `${namespace}/${name}`;

  // Remove from all tracking
  clearPendingSchedule(monitorId);
  removeMonitor(monitorId);
  activeMonitors.delete(monitorId);

  // Drop Prometheus gauge/histogram series so deleted monitors don't leak.
  resetMonitorMetrics(name, namespace);

  logger.debug({ namespace, name }, "Monitor deleted, removed from tracker");
  return Promise.resolve();
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
  for (const timer of pendingScheduleTimers.values()) {
    clearTimeout(timer);
  }
  pendingScheduleTimers.clear();
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
