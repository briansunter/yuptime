/**
 * Job Completion Watcher
 * Watches for Job completion and updates Monitor status
 * Also includes stall detection to recover from missed events
 */

import {
  BatchV1Api,
  CustomObjectsApi,
  type KubeConfig,
} from "@kubernetes/client-node";
import { Watch } from "@kubernetes/client-node/dist/watch";
import { getDatabase } from "../../db";
import { logger } from "../../lib/logger";
import { createCondition, updateStatus } from "../reconcilers/status-utils";

// Stall detection interval (30 seconds)
const STALL_DETECTION_INTERVAL_MS = 30000;

/**
 * Get the last heartbeat for a monitor
 * Uses etcd O(1) latest index lookup
 */
export async function getLastHeartbeat(monitorId: string) {
  const db = getDatabase();

  // Use O(1) latest heartbeat index lookup
  const heartbeat = await db.heartbeats().getLatest(monitorId);

  return heartbeat;
}

/**
 * Start the job completion watcher
 */
export function createJobCompletionWatcher(kubeConfig: KubeConfig) {
  const batchApi = kubeConfig.makeApiClient(BatchV1Api);
  const customObjectsApi = kubeConfig.makeApiClient(CustomObjectsApi);
  let watching = false;
  let watch: any;

  // Track which monitors are currently being scheduled to prevent duplicates
  const schedulingLocks = new Map<string, NodeJS.Timeout>();

  /**
   * Handle Job completion
   */
  async function handleJobCompletion(job: any) {
    const annotations = job.metadata?.annotations || {};
    const monitorId = annotations["monitoring.yuptime.io/monitor"];

    if (!monitorId) {
      logger.debug(
        { jobName: job.metadata?.name },
        "Job missing monitor annotation",
      );
      return;
    }

    const [namespace, name] = monitorId.split("/");

    try {
      // Get the latest heartbeat from database
      const heartbeat = await getLastHeartbeat(monitorId);

      if (!heartbeat) {
        logger.warn({ monitorId }, "No heartbeat found for monitor");
        return;
      }

      // Update Monitor status
      const isHealthy = heartbeat.state === "up";
      const conditionType = isHealthy ? "Healthy" : "Unhealthy";

      const status = {
        conditions: [
          createCondition(
            conditionType,
            isHealthy ? "True" : "False",
            heartbeat.reason || undefined,
            heartbeat.message || undefined,
          ),
        ],
        lastCheck: heartbeat.checkedAt,
        lastState: heartbeat.state,
        latency: heartbeat.latencyMs,
      };

      await updateStatus("Monitor", "monitors", namespace, name, status);

      logger.info(
        {
          monitorId,
          state: heartbeat.state,
          latency: heartbeat.latencyMs,
        },
        "Updated Monitor status after Job completion",
      );

      // Schedule next check using the same interval
      // Load the Monitor CRD to get the interval
      try {
        const monitor = await customObjectsApi.getNamespacedCustomObject({
          group: "monitoring.yuptime.io",
          version: "v1",
          namespace: namespace,
          plural: "monitors",
          name: name,
        });

        const intervalSeconds = monitor.spec?.schedule?.intervalSeconds || 60;

        // Check if already scheduled to prevent duplicates
        if (schedulingLocks.has(monitorId)) {
          logger.debug({ monitorId }, "Next check already scheduled, skipping");
          return;
        }

        // Schedule next check with full interval delay
        const timeoutId = setTimeout(async () => {
          try {
            // Import here to avoid circular dependency
            const {
              buildJobForMonitor,
            } = require("../job-manager/job-builder");
            const { calculateJitter } = require("../job-manager/jitter");

            const jitterPercent = monitor.spec?.schedule?.jitterPercent || 5;
            const jitterMs = calculateJitter(
              namespace,
              name,
              jitterPercent,
              intervalSeconds,
            );

            const job = buildJobForMonitor(monitor, jitterMs);

            await batchApi.createNamespacedJob({
              namespace,
              body: job,
            });

            logger.info({ monitorId, intervalSeconds }, "Scheduled next check");
          } catch (error) {
            logger.error({ monitorId, error }, "Failed to schedule next check");
          } finally {
            // Clear the lock so the next completion can schedule
            schedulingLocks.delete(monitorId);
          }
        }, intervalSeconds * 1000);

        // Store the timeout ID so we can cancel it if needed and track the lock
        schedulingLocks.set(monitorId, timeoutId);
      } catch (error) {
        logger.error(
          { monitorId, error },
          "Failed to load Monitor for rescheduling",
        );
      }
    } catch (error) {
      logger.error(
        { monitorId, error },
        "Failed to update Monitor status after Job completion",
      );
    }
  }

  /**
   * Check if there's an active/pending job for a monitor
   */
  async function hasActiveJobForMonitor(
    namespace: string,
    name: string,
  ): Promise<boolean> {
    try {
      const labelSelector = `monitoring.yuptime.io/monitor=${namespace}-${name}`;
      const jobs = await batchApi.listNamespacedJob({
        namespace,
        labelSelector,
      });

      return jobs.items.some(
        (job) =>
          (job.status?.active && job.status.active > 0) ||
          (!job.status?.succeeded && !job.status?.failed),
      );
    } catch (error) {
      logger.debug(
        { namespace, name, error },
        "Failed to check for active jobs",
      );
      return false;
    }
  }

  /**
   * Schedule a check for a monitor
   * @param monitor - The monitor CRD object
   * @param delayMs - Delay before creating the job (0 for immediate)
   */
  async function scheduleCheck(monitor: any, delayMs: number = 0) {
    const namespace = monitor.metadata?.namespace || "default";
    const name = monitor.metadata?.name;
    const monitorId = `${namespace}/${name}`;

    if (schedulingLocks.has(monitorId)) {
      logger.debug({ monitorId }, "Schedule already pending, skipping");
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const { buildJobForMonitor } = require("../job-manager/job-builder");
        const { calculateJitter } = require("../job-manager/jitter");

        const jitterPercent = monitor.spec?.schedule?.jitterPercent || 5;
        const intervalSeconds = monitor.spec?.schedule?.intervalSeconds || 60;
        const jitterMs = calculateJitter(
          namespace,
          name,
          jitterPercent,
          intervalSeconds,
        );

        const job = buildJobForMonitor(monitor, jitterMs);

        await batchApi.createNamespacedJob({
          namespace,
          body: job,
        });

        logger.info({ monitorId, delayMs }, "Scheduled check");
      } catch (error) {
        logger.error({ monitorId, error }, "Failed to schedule check");
      } finally {
        schedulingLocks.delete(monitorId);
      }
    }, delayMs);

    schedulingLocks.set(monitorId, timeoutId);
  }

  /**
   * Detect and reschedule stalled monitors
   * A monitor is considered stalled if:
   * 1. It's enabled
   * 2. Its last heartbeat is older than (interval * 2)
   * 3. There is no active/pending job for it
   */
  async function detectAndRescheduleStalled() {
    try {
      // List all monitors across all namespaces
      const monitorsResponse = await customObjectsApi.listClusterCustomObject({
        group: "monitoring.yuptime.io",
        version: "v1",
        plural: "monitors",
      });

      const monitors = ((monitorsResponse as any).items || []) as any[];

      for (const monitor of monitors) {
        const namespace = monitor.metadata?.namespace || "default";
        const name = monitor.metadata?.name;
        const monitorId = `${namespace}/${name}`;
        const intervalSeconds = monitor.spec?.schedule?.intervalSeconds || 60;

        // Skip disabled monitors
        if (monitor.spec?.enabled === false) continue;

        // Skip if already in scheduling locks
        if (schedulingLocks.has(monitorId)) continue;

        // Get last heartbeat
        const heartbeat = await getLastHeartbeat(monitorId);

        if (!heartbeat) {
          // No heartbeat ever - check if there's an active job
          const hasActiveJob = await hasActiveJobForMonitor(namespace, name);
          if (!hasActiveJob) {
            logger.info(
              { monitorId },
              "No heartbeat found and no active job, scheduling initial check",
            );
            await scheduleCheck(monitor, 0);
          }
          continue;
        }

        const lastCheckTime = new Date(heartbeat.checkedAt).getTime();
        const now = Date.now();
        const stalledThreshold = intervalSeconds * 2 * 1000; // 2x interval

        if (now - lastCheckTime > stalledThreshold) {
          // Check if there's an active job
          const hasActiveJob = await hasActiveJobForMonitor(namespace, name);

          if (!hasActiveJob) {
            logger.warn(
              {
                monitorId,
                lastCheck: heartbeat.checkedAt,
                stalledFor: Math.round((now - lastCheckTime) / 1000) + "s",
              },
              "Monitor stalled, rescheduling",
            );
            await scheduleCheck(monitor, 0);
          }
        }
      }
    } catch (error) {
      logger.error({ error }, "Failed to detect stalled monitors");
    }
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
    logger.info("Starting Job completion watcher");

    try {
      const path = "/apis/batch/v1/jobs";
      watch = new Watch(kubeConfig);

      // Watch for changes to Jobs
      await watch.watch(
        path,
        { labelSelector: "app.kubernetes.io/component=checker" },
        // callback
        (phase: string, apiObj: any) => {
          // Only process when job is completed (succeeded or failed)
          if (phase === "MODIFIED") {
            const job = apiObj;
            const status = job.status;
            const annotations = job.metadata?.annotations || {};
            const monitorId = annotations["monitoring.yuptime.io/monitor"];

            // Only process jobs that have actually completed
            if (monitorId && (status?.succeeded || status?.failed)) {
              // Check if we've already processed this job (track processed jobs)
              const processedKey = `${job.metadata?.name}-${status?.succeeded || status?.failed}`;
              if (!watch.processedJobs) {
                watch.processedJobs = new Set();
              }

              if (!watch.processedJobs.has(processedKey)) {
                watch.processedJobs.add(processedKey);
                handleJobCompletion(apiObj);

                // Clean up old processed job keys (keep last 100)
                if (watch.processedJobs.size > 100) {
                  const entries = Array.from(watch.processedJobs);
                  watch.processedJobs = new Set(entries.slice(-100));
                }
              }
            }
          }
        },
        // done callback
        (err: any) => {
          if (err) {
            logger.error({ error: err }, "Job watch error");
          }
        },
      );

      logger.info("Job completion watcher started successfully");

      // Start stall detection loop
      setInterval(() => {
        detectAndRescheduleStalled().catch((err) => {
          logger.error({ error: err }, "Stall detection loop failed");
        });
      }, STALL_DETECTION_INTERVAL_MS);

      logger.info(
        { intervalMs: STALL_DETECTION_INTERVAL_MS },
        "Stall detection loop started",
      );
    } catch (error) {
      logger.error({ error }, "Failed to start Job completion watcher");
      watching = false;
      throw error;
    }
  }

  /**
   * Stop watching Jobs
   */
  async function stop() {
    if (!watching) {
      return;
    }

    watching = false;

    // Note: Watch.watch() doesn't return AbortController in this version
    // The watch will be cleaned up when the object is garbage collected
    watch = null;

    logger.info("Job completion watcher stopped");
  }

  return {
    start,
    stop,
    handleJobCompletion,
  };
}
