/**
 * Job Builder
 * Builds Kubernetes Job manifests from Monitor CRDs
 */

import type { V1EnvVar, V1Job } from "@kubernetes/client-node";
import type { Monitor } from "./types";

// Default checker image from environment or fallback
const DEFAULT_CHECKER_IMAGE = process.env.CHECKER_IMAGE || "yuptime-checker:latest";

/**
 * Extract secret-backed environment variables from monitor spec.
 * These are injected into the Job pod using Kubernetes valueFrom.secretKeyRef,
 * which is the Kubernetes-native way to handle secrets in Jobs.
 */
export function extractSecretEnvVars(monitor: Monitor): V1EnvVar[] {
  const envVars: V1EnvVar[] = [];
  const target = monitor.spec.target;

  // MySQL credentials
  if (target.mysql?.credentialsSecretRef) {
    const ref = target.mysql.credentialsSecretRef;
    envVars.push({
      name: "YUPTIME_CRED_MYSQL_USERNAME",
      valueFrom: {
        secretKeyRef: {
          name: ref.name,
          key: ref.usernameKey ?? "username",
        },
      },
    });
    envVars.push({
      name: "YUPTIME_CRED_MYSQL_PASSWORD",
      valueFrom: {
        secretKeyRef: {
          name: ref.name,
          key: ref.passwordKey ?? "password",
        },
      },
    });
  }

  // PostgreSQL credentials
  if (target.postgresql?.credentialsSecretRef) {
    const ref = target.postgresql.credentialsSecretRef;
    envVars.push({
      name: "YUPTIME_CRED_POSTGRESQL_USERNAME",
      valueFrom: {
        secretKeyRef: {
          name: ref.name,
          key: ref.usernameKey ?? "username",
        },
      },
    });
    envVars.push({
      name: "YUPTIME_CRED_POSTGRESQL_PASSWORD",
      valueFrom: {
        secretKeyRef: {
          name: ref.name,
          key: ref.passwordKey ?? "password",
        },
      },
    });
  }

  // Redis credentials (optional - only if credentialsSecretRef is defined)
  if (target.redis?.credentialsSecretRef) {
    const ref = target.redis.credentialsSecretRef;
    envVars.push({
      name: "YUPTIME_CRED_REDIS_PASSWORD",
      valueFrom: {
        secretKeyRef: {
          name: ref.name,
          key: ref.passwordKey ?? "password",
        },
      },
    });
  }

  // HTTP authentication secrets
  if (target.http?.auth) {
    const auth = target.http.auth;

    // Basic auth
    if (auth.basic?.secretRef) {
      const ref = auth.basic.secretRef;
      envVars.push({
        name: "YUPTIME_AUTH_BASIC_USERNAME",
        valueFrom: {
          secretKeyRef: {
            name: ref.name,
            key: ref.usernameKey ?? "username",
          },
        },
      });
      envVars.push({
        name: "YUPTIME_AUTH_BASIC_PASSWORD",
        valueFrom: {
          secretKeyRef: {
            name: ref.name,
            key: ref.passwordKey ?? "password",
          },
        },
      });
    }

    // Bearer token
    if (auth.bearer?.tokenSecretRef) {
      const ref = auth.bearer.tokenSecretRef;
      envVars.push({
        name: "YUPTIME_AUTH_BEARER_TOKEN",
        valueFrom: {
          secretKeyRef: {
            name: ref.name,
            key: ref.key,
          },
        },
      });
    }

    // OAuth2 client credentials
    if (auth.oauth2?.clientSecretRef) {
      const ref = auth.oauth2.clientSecretRef;
      envVars.push({
        name: "YUPTIME_AUTH_OAUTH_CLIENT_ID",
        valueFrom: {
          secretKeyRef: {
            name: ref.name,
            key: ref.clientIdKey ?? "client_id",
          },
        },
      });
      envVars.push({
        name: "YUPTIME_AUTH_OAUTH_CLIENT_SECRET",
        valueFrom: {
          secretKeyRef: {
            name: ref.name,
            key: ref.clientSecretKey ?? "client_secret",
          },
        },
      });
    }
  }

  return envVars;
}

/**
 * Build a Kubernetes Job manifest for a monitor check
 */
export function buildJobForMonitor(
  monitor: Monitor,
  jitterMs: number,
  image: string = DEFAULT_CHECKER_IMAGE,
): V1Job {
  const namespace = monitor.metadata.namespace || "default";
  const monitorId = `${namespace}/${monitor.metadata.name}`;
  // Sanitize monitor ID for Kubernetes labels (replace '/' with '-')
  const monitorLabelId = monitorId.replace(/\//g, "-");
  const timestamp = Date.now();

  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name: `monitor-${namespace.replace(/[^a-z0-9]/g, "-")}-${monitor.metadata.name}-${timestamp}`,
      namespace,
      annotations: {
        "monitoring.yuptime.io/monitor": monitorId,
        "monitoring.yuptime.io/jitter-offset": jitterMs.toString(),
        "monitoring.yuptime.io/check-id": `${monitorId}-${timestamp}`,
      },
      labels: {
        "app.kubernetes.io/name": "yuptime",
        "app.kubernetes.io/component": "checker",
        "monitoring.yuptime.io/monitor": monitorLabelId,
      },
      // Auto-cleanup when Monitor is deleted
      ownerReferences: monitor.metadata.uid
        ? [
            {
              apiVersion: monitor.apiVersion,
              kind: monitor.kind,
              name: monitor.metadata.name,
              uid: monitor.metadata.uid,
              controller: true,
              blockOwnerDeletion: true,
            },
          ]
        : undefined,
    },
    spec: {
      backoffLimit: 0, // No retries (check logic handles retry)
      activeDeadlineSeconds: 300, // 5 minutes max execution time
      ttlSecondsAfterFinished: 3600, // Auto-cleanup after 1 hour
      template: {
        metadata: {
          labels: {
            "app.kubernetes.io/name": "yuptime",
            "app.kubernetes.io/component": "checker",
            "monitoring.yuptime.io/monitor": monitorLabelId,
          },
        },
        spec: {
          restartPolicy: "Never",
          serviceAccountName: "yuptime-checker",
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 1000,
            fsGroup: 1000,
            seccompProfile: {
              type: "RuntimeDefault",
            },
          },
          containers: [
            {
              name: "checker",
              image,
              imagePullPolicy: image === "yuptime-checker:latest" ? "Never" : "Always",
              args: ["--monitor", monitorId],
              env: [
                {
                  name: "NODE_ENV",
                  value: process.env.NODE_ENV || "production",
                },
                {
                  name: "NODE_TLS_REJECT_UNAUTHORIZED",
                  value: "0",
                },
                // Inject secret-backed credentials from Monitor spec
                ...extractSecretEnvVars(monitor),
              ],
              volumeMounts: [
                {
                  name: "tmp",
                  mountPath: "/tmp",
                },
              ],
              resources: {
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
                  add: ["NET_RAW"], // Required for ping checker
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
  };
}

/**
 * Build a job name filter for listing jobs
 */
export function buildJobLabelSelector(monitorId: string): string {
  return `monitoring.yuptime.io/monitor=${monitorId}`;
}
