/**
 * Job Completion Watcher
 *
 * Watches for Kubernetes Jobs to complete, updates Monitor CRD status,
 * exports Prometheus metrics, and manages incidents.
 *
 * Database-free - all state in Kubernetes CRDs and Prometheus metrics.
 */

import {
  CustomObjectsApi,
  type KubeConfig,
  type V1Job,
} from "@kubernetes/client-node";
import { Watch } from "@kubernetes/client-node/dist/watch";
import { sendAlertToAlertmanager } from "../../alerting";
import { logger } from "../../lib/logger";
import { recordCheckResult } from "../../lib/prometheus";
import type { Monitor } from "../../types/crd/monitor";

export interface JobCompletionWatcherConfig {
  kubeConfig: KubeConfig;
  namespace: string;
}

/**
 * Create job completion watcher
 */
export function createJobCompletionWatcher(config: JobCompletionWatcherConfig) {
  const customObjectsApi = config.kubeConfig.makeApiClient(CustomObjectsApi);

  let watching = false;
  let watch: Watch | null = null;
  const processedJobs = new Set<string>();

  /**
   * Handle Job completion
   */
  async function handleJobCompletion(job: V1Job) {
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
      // Get Monitor CRD to see the check result (written by checker executor)
      const monitorResponse = await customObjectsApi.getNamespacedCustomObject({
        group: "monitoring.yuptime.io",
        version: "v1",
        namespace: namespace ?? "default",
        plural: "monitors",
        name: name ?? "unknown",
      });

      const monitor = monitorResponse as Monitor;
      const checkResult = monitor.status?.lastResult;

      if (!checkResult) {
        logger.warn({ monitorId }, "No check result in Monitor status");
        return;
      }

      // Export check result to Prometheus metrics
      const metricsData: {
        state: "down" | "up" | "flapping" | "pending" | "paused";
        latencyMs?: number;
        durationMs?: number;
      } = {
        state: checkResult.state,
      };
      if (checkResult.latencyMs !== undefined) {
        metricsData.latencyMs = checkResult.latencyMs;
      }
      if (!checkResult.attempts) {
        metricsData.durationMs = 0;
      }
      recordCheckResult(
        name ?? "unknown",
        namespace ?? "default",
        monitor.spec.type,
        getMonitorUrl(monitor),
        metricsData,
      );

      logger.info(
        { monitorId, state: checkResult.state, latency: checkResult.latencyMs },
        "Exported Prometheus metrics after Job completion",
      );

      // Detect state changes for alerting
      const currentState = checkResult.state;
      const previousState = monitor.status?.lastResult?.state;

      if (previousState && previousState !== currentState) {
        await handleStateChange(monitor, previousState, currentState);
      }
    } catch (error) {
      logger.error({ monitorId, error }, "Failed to process Job completion");
    }
  }

  /**
   * Handle monitor state changes (up → down or down → up)
   */
  async function handleStateChange(
    monitor: Monitor,
    fromState: string,
    toState: string,
  ) {
    const monitorName = monitor.metadata.name;
    const reason =
      monitor.status?.lastResult?.reason ||
      `State changed from ${fromState} to ${toState}`;

    // Send alert to Alertmanager if configured
    await sendAlertToAlertmanager(
      monitor,
      toState as "up" | "down" | "pending" | "flapping" | "paused",
      fromState,
      `Monitor ${monitorName} is ${toState}`,
    );

    logger.info(
      { monitorName, fromState, toState, reason },
      "Monitor state changed",
    );
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
      const path = "/apis/batch/v1/jobs";
      watch = new Watch(config.kubeConfig);

      // Watch for changes to Jobs
      await watch.watch(
        path,
        { labelSelector: "app.kubernetes.io/component=checker" },
        // callback
        (phase: string, apiObj: V1Job) => {
          // Only process when job is completed (succeeded or failed)
          if (phase === "MODIFIED") {
            const job = apiObj;
            const status = job.status;
            const annotations = job.metadata?.annotations || {};
            const monitorId = annotations["monitoring.yuptime.io/monitor"];

            // Only process jobs that have actually completed
            if (monitorId && (status?.succeeded || status?.failed)) {
              // Check if we've already processed this job
              const processedKey = `${job.metadata?.name}-${status?.succeeded || status?.failed}`;

              if (!processedJobs.has(processedKey)) {
                processedJobs.add(processedKey);
                handleJobCompletion(apiObj);

                // Clean up old processed job keys (keep last 100)
                if (processedJobs.size > 100) {
                  const entries = Array.from(processedJobs);
                  processedJobs.clear();
                  for (const key of entries.slice(-100)) {
                    processedJobs.add(key);
                  }
                }
              }
            }
          }
        },
        // done callback
        (err: unknown) => {
          if (err) {
            logger.error({ error: err }, "Job watch error");
          }
        },
      );

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

export type JobCompletionWatcher = ReturnType<
  typeof createJobCompletionWatcher
>;

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
