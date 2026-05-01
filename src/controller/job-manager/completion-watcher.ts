/**
 * Job Completion Watcher
 *
 * Watches for Kubernetes Jobs to complete, updates Monitor CRD status,
 * exports Prometheus metrics, and manages incidents.
 *
 * Database-free - all state in Kubernetes CRDs and Prometheus metrics.
 */

import type { KubeConfig, V1Job } from "@kubernetes/client-node";
import { sendAlertToAlertmanager } from "../../alerting";
import { logger } from "../../lib/logger";
import {
  decrementActiveIncidents,
  incrementActiveIncidents,
  recordCheckResult,
  recordStateChange,
} from "../../lib/prometheus";
import type { Monitor } from "../../types/crd/monitor";
import { createCRDWatcher, startK8sWatch, type WatchHandle } from "../k8s-client";
import { calculateJitter } from "./jitter";
import { recordSchedule, removeMonitor } from "./schedule-tracker";
import type { JobManager } from "./types";

/**
 * Reschedule a monitor check with retry logic and exponential backoff.
 * Exported for testability.
 */
export async function rescheduleWithRetry(
  jobManager: JobManager,
  monitor: Monitor,
  monitorId: string,
  maxRetries = 3,
): Promise<void> {
  if (monitor.spec.enabled === false) {
    removeMonitor(monitorId);
    logger.info({ monitorId }, "Skipped reschedule because monitor is disabled");
    return;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await jobManager.scheduleCheck(monitor);
      recordSchedule(monitorId);
      logger.info({ monitorId }, "Rescheduled monitor check");
      return;
    } catch (error) {
      if (attempt < maxRetries) {
        const backoffMs = 1000 * 2 ** attempt; // 1s, 2s, 4s
        logger.warn({ monitorId, attempt: attempt + 1, backoffMs, error }, "Retry scheduling");
        await new Promise((r) => setTimeout(r, backoffMs));
      } else {
        logger.error({ monitorId, error }, "All retries exhausted, safety-net will recover");
      }
    }
  }
}

export interface JobCompletionWatcherConfig {
  kubeConfig: KubeConfig;
  namespace: string;
  jobManager?: JobManager;
}

/**
 * Create job completion watcher
 */
export function createJobCompletionWatcher(config: JobCompletionWatcherConfig) {
  const monitorWatcher = createCRDWatcher("monitoring.yuptime.io", "v1", "monitors");
  const WATCH_RESTART_DELAY_MS = 1000;
  const WATCH_ROTATION_INTERVAL_MS = 4 * 60 * 1000;

  let watching = false;
  let watchHandle: WatchHandle | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let rotationTimer: ReturnType<typeof setTimeout> | null = null;
  let watchGeneration = 0;
  const processedJobs = new Set<string>();
  const pendingReschedules = new Set<string>();
  const activeIncidentKeys = new Set<string>();

  function parseMonitorId(monitorId: string): { namespace: string; name: string } | null {
    const [namespace, name] = monitorId.split("/");
    if (!namespace || !name) {
      return null;
    }

    return { namespace, name };
  }

  function clearRestartTimer() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function clearRotationTimer() {
    if (rotationTimer) {
      clearTimeout(rotationTimer);
      rotationTimer = null;
    }
  }

  function scheduleRestart(error?: unknown) {
    if (!watching || restartTimer) {
      return;
    }

    logger.warn({ error }, "Scheduling Job completion watcher restart");

    restartTimer = setTimeout(async () => {
      restartTimer = null;

      if (!watching) {
        return;
      }

      try {
        await startWatch(watchGeneration + 1);
        logger.info("Job completion watcher restarted successfully");
      } catch (restartError) {
        logger.error({ error: restartError }, "Failed to restart Job completion watcher");
        scheduleRestart(restartError);
      }
    }, WATCH_RESTART_DELAY_MS);
  }

  function scheduleRotation(generation: number) {
    clearRotationTimer();

    rotationTimer = setTimeout(() => {
      if (!watching || watchGeneration !== generation) {
        return;
      }

      logger.info("Rotating Job completion watcher proactively");
      scheduleRestart();
    }, WATCH_ROTATION_INTERVAL_MS);
  }

  /**
   * Handle Job completion
   */
  async function handleJobCompletion(job: V1Job) {
    const annotations = job.metadata?.annotations || {};
    const monitorId = annotations["monitoring.yuptime.io/monitor"];

    if (!monitorId) {
      logger.debug({ jobName: job.metadata?.name }, "Job missing monitor annotation");
      return;
    }

    const parsedMonitorId = parseMonitorId(monitorId);
    if (!parsedMonitorId) {
      logger.warn({ jobName: job.metadata?.name, monitorId }, "Job has invalid monitor annotation");
      return;
    }

    const { namespace, name } = parsedMonitorId;

    try {
      // Get Monitor CRD to see the check result (written by checker executor)
      const monitorResponse = await monitorWatcher.get(name, namespace);

      const monitor = monitorResponse as Monitor;
      const checkResult = monitor.status?.lastResult;

      if (!checkResult) {
        logger.warn({ monitorId }, "No check result in Monitor status");
        return;
      }

      // Export check result to Prometheus metrics. durationMs is intentionally
      // omitted: the checker executor does not record wall-clock duration
      // separately from latencyMs, and dual-publishing the same value under
      // two metrics would mislead dashboards.
      recordCheckResult(name, namespace, monitor.spec.type, getMonitorUrl(monitor), {
        state: checkResult.state,
        latencyMs: checkResult.latencyMs,
      });

      logger.info(
        { monitorId, state: checkResult.state, latency: checkResult.latencyMs },
        "Exported Prometheus metrics after Job completion",
      );

      // Detect state changes for alerting. previousResult is set by the
      // checker executor before each patch, so it is the state from the
      // previous check. On the very first check there is no previousResult:
      // treat that as a transition only when the initial state is unhealthy,
      // so a clean pending→up bring-up does not page anyone.
      const currentState = checkResult.state;
      const previousState = monitor.status?.previousResult?.state;

      if (previousState) {
        if (previousState !== currentState) {
          await handleStateChange(monitor, previousState, currentState);
        }
      } else if (currentState !== "up") {
        await handleStateChange(monitor, "pending", currentState);
      }

      // Reschedule the next check (with dedup to prevent cascade from multiple completions)
      if (monitor.spec.enabled !== false && config.jobManager) {
        // Dedup: skip if a reschedule setTimeout is already pending for this monitor
        // This prevents N simultaneous completions from creating N new jobs (cascade).
        // Unlike the schedule-tracker guard, this does NOT block the next cycle's
        // completion handler, because the Set entry is cleared when setTimeout fires.
        if (pendingReschedules.has(monitorId)) {
          logger.debug({ monitorId }, "Reschedule already pending, skipping duplicate");
        } else {
          const intervalSeconds = monitor.spec.schedule?.intervalSeconds || 60;
          const jitterPercent = monitor.spec.schedule?.jitterPercent || 5;
          const jitterMs = calculateJitter(namespace, name, jitterPercent, intervalSeconds);
          const delayMs = intervalSeconds * 1000 + jitterMs;
          const jm = config.jobManager;

          pendingReschedules.add(monitorId);

          setTimeout(() => {
            pendingReschedules.delete(monitorId);

            getLatestEnabledMonitor(namespace, name, monitorId)
              .then((latestMonitor) => {
                if (!latestMonitor) {
                  return;
                }

                return rescheduleWithRetry(jm, latestMonitor, monitorId);
              })
              .catch((err) => {
                logger.error({ monitorId, error: err }, "Unexpected failure in pending reschedule");
              });
          }, delayMs);

          logger.debug({ monitorId, nextCheckInMs: delayMs }, "Next check scheduled");
        }
      }
    } catch (error) {
      logger.error({ monitorId, error }, "Failed to process Job completion");
    }
  }

  /**
   * Handle monitor state changes (up → down or down → up)
   */
  async function handleStateChange(monitor: Monitor, fromState: string, toState: string) {
    const monitorName = monitor.metadata.name;
    const namespace = monitor.metadata.namespace;
    const reason =
      monitor.status?.lastResult?.reason || `State changed from ${fromState} to ${toState}`;

    recordStateChange(monitorName, namespace, fromState, toState);

    const incidentKey = `${namespace}/${monitorName}`;
    if (toState === "down") {
      if (!activeIncidentKeys.has(incidentKey)) {
        activeIncidentKeys.add(incidentKey);
        incrementActiveIncidents(monitorName, namespace, "critical");
      }
    } else if (fromState === "down") {
      if (activeIncidentKeys.delete(incidentKey)) {
        decrementActiveIncidents(monitorName, namespace, "critical");
      }
    }

    if (shouldNotifyStateChange(monitor, toState)) {
      await sendAlertToAlertmanager(
        monitor,
        toState as "up" | "down" | "pending" | "flapping" | "paused",
        fromState,
        `Monitor ${monitorName} is ${toState}`,
      );
    }

    logger.info({ monitorName, fromState, toState, reason }, "Monitor state changed");
  }

  function shouldNotifyStateChange(monitor: Monitor, toState: string): boolean {
    const notifyOn = monitor.spec.alerting?.notifyOn;

    if (toState === "down") {
      return notifyOn?.down ?? true;
    }
    if (toState === "up") {
      return notifyOn?.up ?? true;
    }
    if (toState === "flapping") {
      return notifyOn?.flapping ?? true;
    }

    return true;
  }

  async function getLatestEnabledMonitor(
    namespace: string,
    name: string,
    monitorId: string,
  ): Promise<Monitor | null> {
    try {
      const latestMonitor = (await monitorWatcher.get(name, namespace)) as Monitor;
      if (latestMonitor.spec.enabled === false) {
        removeMonitor(monitorId);
        logger.info({ monitorId }, "Skipped pending reschedule because monitor is disabled");
        return null;
      }

      return latestMonitor;
    } catch (error) {
      if (isNotFoundError(error)) {
        removeMonitor(monitorId);
        logger.info({ monitorId }, "Skipped pending reschedule because monitor no longer exists");
        return null;
      }

      throw error;
    }
  }

  function isNotFoundError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 404
    );
  }

  function processJobEvent(phase: string, job: V1Job) {
    if (phase !== "MODIFIED" || !isCompletedCheckerJob(job)) {
      return;
    }

    const completedCount = job.status?.succeeded || job.status?.failed || 0;
    const processedKey = `${job.metadata?.uid || job.metadata?.name}-${completedCount}`;

    if (processedJobs.has(processedKey)) {
      return;
    }

    processedJobs.add(processedKey);
    trimProcessedJobs();

    handleJobCompletion(job).catch((error) => {
      logger.error({ error }, "Unexpected failure while handling Job completion");
    });
  }

  function isCompletedCheckerJob(job: V1Job): boolean {
    const monitorId = job.metadata?.annotations?.["monitoring.yuptime.io/monitor"];
    return Boolean(monitorId && (job.status?.succeeded || job.status?.failed));
  }

  function trimProcessedJobs() {
    if (processedJobs.size <= 100) {
      return;
    }

    const entries = Array.from(processedJobs);
    processedJobs.clear();
    for (const key of entries.slice(-100)) {
      processedJobs.add(key);
    }
  }

  async function startWatch(generation = watchGeneration + 1) {
    const path = "/apis/batch/v1/jobs";
    watchGeneration = generation;

    clearRotationTimer();
    watchHandle?.abort();

    watchHandle = await startK8sWatch<V1Job>(
      path,
      { labelSelector: "app.kubernetes.io/component=checker" },
      processJobEvent,
      (err: unknown) => {
        if (!watching || generation !== watchGeneration) {
          return;
        }

        if (err) {
          logger.error({ error: err }, "Job watch error");
        } else {
          logger.warn("Job watch closed, restarting");
        }

        scheduleRestart(err);
      },
    );

    scheduleRotation(generation);
  }

  /**
   * Start watching Jobs
   */
  async function start() {
    if (watching) {
      logger.warn("Job completion watcher already running");
      return;
    }

    watching = true;
    logger.info("Starting Job completion watcher...");

    try {
      clearRestartTimer();
      clearRotationTimer();
      await startWatch();
      logger.info("Job completion watcher started successfully");
    } catch (error) {
      logger.error({ error }, "Failed to start Job completion watcher");
      watching = false;
      throw error;
    }
  }

  /**
   * Stop watching Jobs
   */
  function stop() {
    if (!watching) {
      return;
    }

    watching = false;
    clearRestartTimer();
    clearRotationTimer();
    watchHandle?.abort();
    watchHandle = null;
    watchGeneration = 0;

    logger.info("Job completion watcher stopped");
  }

  return {
    start,
    stop,
    handleJobCompletion,
  };
}

export type JobCompletionWatcher = ReturnType<typeof createJobCompletionWatcher>;

/**
 * Extract monitor URL for metrics labels
 */
function getMonitorUrl(monitor: Monitor): string {
  const target = monitor.spec?.target;

  if (target?.http) {
    return target.http.url;
  }
  if (target?.tcp) {
    return `${target.tcp.host}:${target.tcp.port}`;
  }
  if (target?.dns) {
    return target.dns.name;
  }
  if (target?.ping) {
    return target.ping.host;
  }
  if (target?.websocket) {
    return target.websocket.url;
  }
  if (target?.k8s) {
    return `${target.k8s.resource.kind}/${target.k8s.resource.name}`;
  }

  return "unknown";
}
