/**
 * Job Manager
 * Creates and manages Kubernetes Jobs for monitor check execution
 */

import { CoreV1Api } from "@kubernetes/client-node";
import { logger } from "../../lib/logger";
import { getBatchApiClient } from "../k8s-client";
import { calculateJitter } from "./jitter";
import { buildJobForMonitor, buildJobLabelSelector } from "./job-builder";
import type {
  JobManager,
  JobManagerConfig,
  JobResult,
  JobStatus,
  Monitor,
} from "./types";

/**
 * Create a new Job Manager instance
 */
export function createJobManager(config: JobManagerConfig): JobManager {
  const batchApi = getBatchApiClient();
  const coreApi = config.kubeConfig.makeApiClient(CoreV1Api);

  const defaultNamespace = config.namespace || "default";

  let running = false;

  /**
   * Schedule a check for the given monitor
   */
  async function scheduleCheck(monitor: Monitor): Promise<JobResult> {
    const namespace = monitor.metadata.namespace || defaultNamespace;
    const name = monitor.metadata.name;
    const monitorId = `${namespace}/${name}`;

    try {
      // Calculate jitter (5% default, configurable via monitor spec)
      const jitterPercent = monitor.spec.schedule?.jitterPercent || 5;
      const intervalSeconds = monitor.spec.schedule?.intervalSeconds || 60;
      const jitterMs = calculateJitter(
        namespace,
        name,
        jitterPercent,
        intervalSeconds,
      );

      logger.debug(
        { monitorId, jitterMs, namespace, name },
        "Calculated jitter for monitor",
      );

      // Build Job manifest
      const job = buildJobForMonitor(monitor, jitterMs);

      logger.debug(
        { namespace, jobName: job.metadata?.name || "unknown" },
        "Creating Job with namespace",
      );

      // Create the Job
      if (!namespace || namespace === "") {
        throw new Error(
          `Namespace is invalid: "${namespace}" for monitor ${monitorId}`,
        );
      }

      // Debug logging
      logger.debug(
        {
          namespace: namespace,
          namespaceType: typeof namespace,
          jobMetadata: job.metadata,
          bodyType: typeof job,
        },
        "About to call createNamespacedJob",
      );

      // Use options object format for @kubernetes/client-node v1.4+
      const response = await batchApi.createNamespacedJob({
        namespace,
        body: job,
      });

      const responseJobName =
        response.metadata?.name || job.metadata?.name || "unknown";

      logger.info(
        {
          monitorId,
          jobName: responseJobName,
          jitterMs,
        },
        "Created Job for monitor check",
      );

      return {
        jobName: responseJobName,
        namespace,
        monitorId,
      };
    } catch (error) {
      logger.error({ monitorId, error }, "Failed to create Job for monitor");
      throw error;
    }
  }

  /**
   * Cancel pending jobs for a monitor
   */
  async function cancelJob(
    namespace: string,
    monitorName: string,
  ): Promise<void> {
    const monitorId = `${namespace}/${monitorName}`;
    const labelSelector = buildJobLabelSelector(monitorId);

    try {
      // List all Jobs for this monitor
      const response = await batchApi.listNamespacedJob({
        namespace,
        labelSelector,
      });

      const jobs = response.items;

      // Delete all active jobs
      for (const job of jobs) {
        if (job.status?.active === 0 || !job.status?.completionTime) {
          const jobName = job.metadata?.name;
          if (!jobName) continue;

          await batchApi.deleteNamespacedJob({
            name: jobName,
            namespace,
          });
          logger.info(
            {
              monitorId,
              jobName,
            },
            "Cancelled Job for monitor",
          );
        }
      }

      logger.debug(
        { monitorId, count: jobs.length },
        "Cancelled Jobs for monitor",
      );
    } catch (error) {
      logger.error({ monitorId, error }, "Failed to cancel Jobs for monitor");
      throw error;
    }
  }

  /**
   * Get status of a job
   */
  async function getJobStatus(
    jobName: string,
    namespace: string,
  ): Promise<JobStatus> {
    try {
      const job = await batchApi.readNamespacedJob({
        name: jobName,
        namespace,
      });

      if (job.status?.succeeded) {
        return "succeeded";
      }
      if (job.status?.failed) {
        return "failed";
      }
      if (job.status?.active) {
        return "running";
      }
      return "pending";
    } catch (err) {
      const error = err as any;
      if (error.statusCode === 404) {
        return "pending";
      }
      throw error;
    }
  }

  /**
   * Cleanup old finished jobs
   */
  async function cleanupOldJobs(maxAgeSeconds: number): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxAgeSeconds * 1000);
    let deletedCount = 0;

    try {
      // List all Jobs with our label
      const response = await batchApi.listJobForAllNamespaces({
        labelSelector: "app.kubernetes.io/component=checker",
      });

      const jobs = response.items;

      for (const job of jobs) {
        const completionTime = job.status?.completionTime;
        const jobName = job.metadata?.name;
        const jobNamespace = job.metadata?.namespace;

        if (completionTime && jobName && jobNamespace) {
          const completedAt = new Date(completionTime);
          if (completedAt < cutoffTime) {
            try {
              await batchApi.deleteNamespacedJob({
                name: jobName,
                namespace: jobNamespace,
              });
              deletedCount++;
            } catch (error) {
              logger.warn({ jobName, error }, "Failed to delete old Job");
            }
          }
        }
      }

      if (deletedCount > 0) {
        logger.info({ deletedCount, maxAgeSeconds }, "Cleaned up old Jobs");
      }

      return deletedCount;
    } catch (error) {
      logger.error({ error }, "Failed to cleanup old Jobs");
      return deletedCount;
    }
  }

  /**
   * Start the job manager
   */
  async function start(): Promise<void> {
    if (running) {
      logger.warn("Job Manager is already running");
      return;
    }

    running = true;
    logger.info("Job Manager started");

    // TODO: Start background cleanup task
    // setInterval(() => cleanupOldJobs(config.jobTTL), 3600000); // Every hour
  }

  /**
   * Stop the job manager
   */
  async function stop(): Promise<void> {
    if (!running) {
      return;
    }

    running = false;
    logger.info("Job Manager stopped");

    // TODO: Stop background cleanup task
  }

  return {
    scheduleCheck,
    cancelJob,
    getJobStatus,
    cleanupOldJobs,
    start,
    stop,
  };
}

export type {
  JobManager,
  JobManagerConfig,
  JobResult,
  JobStatus,
  Monitor,
} from "./types";
