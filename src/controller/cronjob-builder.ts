/**
 * CronJob Builder
 *
 * Builds Kubernetes CronJob manifests from Monitor CRDs.
 * Replaces custom setTimeout-based scheduler with Kubernetes-native CronJobs.
 */

import type { V1CronJob, V1Toleration } from "@kubernetes/client-node";
import { intervalToCron } from "../lib/cron-converter";
import type { Monitor } from "../types/crd/monitor";

export interface CronJobBuilderConfig {
  checkerImage: string;
  imagePullPolicy?: "Always" | "IfNotPresent" | "Never";
  serviceAccountName?: string;
  tolerations?: V1Toleration[];
  nodeSelector?: Record<string, string>;
  resources?: {
    requests?: { cpu: string; memory: string };
    limits?: { cpu: string; memory: string };
  };
}

/**
 * Build a CronJob for a monitor
 */
export function buildCronJobForMonitor(monitor: Monitor, config: CronJobBuilderConfig): V1CronJob {
  const namespace = monitor.metadata.namespace || "default";
  const name = monitor.metadata.name;
  const monitorId = `${namespace}/${name}`;
  const intervalSeconds = monitor.spec.schedule?.intervalSeconds || 60;

  // Convert interval to cron schedule
  const cronConfig = intervalToCron(intervalSeconds);
  const schedule = cronConfig.schedule;

  // Build CronJob manifest
  const cronJob: V1CronJob = {
    apiVersion: "batch/v1",
    kind: "CronJob",
    metadata: {
      name: `monitor-${name}`,
      namespace,
      labels: {
        "app.kubernetes.io/name": "yuptime",
        "app.kubernetes.io/component": "monitor-scheduler",
        "app.kubernetes.io/instance": name,
        "monitoring.yuptime.io/monitor": name,
        "monitoring.yuptime.io/namespace": namespace,
      },
      ownerReferences: [
        {
          apiVersion: monitor.apiVersion || "monitoring.yuptime.io/v1",
          kind: monitor.kind,
          name: name,
          uid: monitor.metadata.uid || "",
          controller: true,
          blockOwnerDeletion: true,
        },
      ],
      annotations: {
        "monitoring.yuptime.io/monitor-id": monitorId,
        "monitoring.yuptime.io/interval": String(intervalSeconds),
      },
    },
    spec: {
      schedule,
      concurrencyPolicy: "Forbid", // Don't run if previous job still running
      successfulJobsHistoryLimit: 3,
      failedJobsHistoryLimit: 3,
      startingDeadlineSeconds: 60, // Allow 1 minute window for job to start
      jobTemplate: {
        metadata: {
          labels: {
            "app.kubernetes.io/name": "yuptime",
            "app.kubernetes.io/component": "checker",
            "monitoring.yuptime.io/monitor": name,
            "monitoring.yuptime.io/namespace": namespace,
          },
        },
        spec: {
          backoffLimit: 0, // No retries (check logic handles failures)
          activeDeadlineSeconds: 300, // 5 minutes max execution time
          ttlSecondsAfterFinished: 3600, // Auto-cleanup after 1 hour
          template: {
            metadata: {
              labels: {
                "app.kubernetes.io/name": "yuptime",
                "app.kubernetes.io/component": "checker",
                "monitoring.yuptime.io/monitor": name,
                "monitoring.yuptime.io/namespace": namespace,
              },
            },
            spec: {
              restartPolicy: "Never",
              serviceAccountName: config.serviceAccountName || "yuptime-checker",
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 1000,
                fsGroup: 1000,
                seccompProfile: {
                  type: "RuntimeDefault",
                },
              },
              tolerations: config.tolerations ?? undefined,
              nodeSelector: config.nodeSelector ?? undefined,
              containers: [
                {
                  name: "checker",
                  image: config.checkerImage,
                  imagePullPolicy: config.imagePullPolicy || "Always",
                  args: ["--monitor", monitorId],
                  env: [
                    {
                      name: "NODE_ENV",
                      value: process.env.NODE_ENV || "production",
                    },
                    {
                      name: "MONITOR_NAMESPACE",
                      value: namespace,
                    },
                    {
                      name: "MONITOR_NAME",
                      value: name,
                    },
                    // Add sleep interval if sub-minute checks
                    ...(cronConfig.needsSubMinuteSleep && cronConfig.sleepSeconds
                      ? [
                          {
                            name: "YUPTIME_SLEEP_SECONDS",
                            value: String(cronConfig.sleepSeconds),
                          },
                        ]
                      : []),
                  ],
                  volumeMounts: [
                    {
                      name: "tmp",
                      mountPath: "/tmp",
                    },
                  ],
                  resources: config.resources || {
                    requests: {
                      cpu: "100m",
                      memory: "64Mi",
                    },
                    limits: {
                      cpu: "500m",
                      memory: "256Mi",
                    },
                  },
                  securityContext: {
                    allowPrivilegeEscalation: false,
                    readOnlyRootFilesystem: true,
                    capabilities: {
                      drop: ["ALL"],
                    },
                  },
                },
              ],
              volumes: [
                {
                  name: "tmp",
                  emptyDir: {},
                },
              ],
            },
          },
        },
      },
    },
  };

  return cronJob;
}

/**
 * Build a label selector for finding CronJobs for a specific monitor
 */
export function buildCronJobLabelSelector(monitorName: string): string {
  return `monitoring.yuptime.io/monitor=${monitorName}`;
}

/**
 * Extract monitor ID from CronJob labels
 */
export function getMonitorIdFromCronJob(cronJob: V1CronJob): string | null {
  const annotations = cronJob.metadata?.annotations || {};
  return annotations["monitoring.yuptime.io/monitor-id"] || null;
}
