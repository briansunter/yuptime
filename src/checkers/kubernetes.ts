/**
 * Kubernetes endpoint health checker
 *
 * Monitors pod and endpoint status within a Kubernetes cluster
 * Can check: pod running status, endpoint readiness, deployment replicas
 */

import { getKubernetesClient } from "../controller/k8s-client";
import { logger } from "../lib/logger";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

type ResourceCheck = {
  readyReplicas: number;
  desiredReplicas: number;
  message: string;
};

type ResourceCheckResult = ResourceCheck | { error: { reason: string; message: string } };

type Apps = Awaited<ReturnType<typeof getKubernetesClient>>["apps"];
type Core = Awaited<ReturnType<typeof getKubernetesClient>>["core"];

async function checkDeployment(
  apps: Apps,
  namespace: string,
  name: string,
): Promise<ResourceCheckResult> {
  try {
    const deployment = await apps.readNamespacedDeployment({ name, namespace });
    const desiredReplicas = deployment.spec?.replicas || 1;
    const readyReplicas = deployment.status?.readyReplicas || 0;
    const status = readyReplicas === desiredReplicas ? "ready" : "degraded";
    const message =
      status === "ready"
        ? `Deployment has ${readyReplicas}/${desiredReplicas} ready replicas`
        : `Deployment degraded: ${readyReplicas}/${desiredReplicas} ready replicas`;
    return { readyReplicas, desiredReplicas, message };
  } catch {
    return {
      error: {
        reason: "K8S_DEPLOYMENT_NOT_FOUND",
        message: `Deployment ${namespace}/${name} not found`,
      },
    };
  }
}

async function checkStatefulSet(
  apps: Apps,
  namespace: string,
  name: string,
): Promise<ResourceCheckResult> {
  try {
    const statefulSet = await apps.readNamespacedStatefulSet({ name, namespace });
    const desiredReplicas = statefulSet.spec?.replicas || 1;
    const readyReplicas = statefulSet.status?.readyReplicas || 0;
    const status = readyReplicas === desiredReplicas ? "ready" : "degraded";
    const message =
      status === "ready"
        ? `StatefulSet has ${readyReplicas}/${desiredReplicas} ready replicas`
        : `StatefulSet degraded: ${readyReplicas}/${desiredReplicas} ready replicas`;
    return { readyReplicas, desiredReplicas, message };
  } catch {
    return {
      error: {
        reason: "K8S_STATEFULSET_NOT_FOUND",
        message: `StatefulSet ${namespace}/${name} not found`,
      },
    };
  }
}

async function checkService(
  core: Core,
  namespace: string,
  name: string,
): Promise<ResourceCheckResult> {
  try {
    const endpoints = await core.readNamespacedEndpoints({ name, namespace });
    const readyAddresses =
      endpoints.subsets?.reduce((acc, subset) => acc + (subset.addresses?.length || 0), 0) || 0;
    const message =
      readyAddresses > 0
        ? `Service has ${readyAddresses} ready endpoints`
        : "Service has no ready endpoints";
    return { readyReplicas: readyAddresses, desiredReplicas: 1, message };
  } catch {
    return {
      error: {
        reason: "K8S_SERVICE_NOT_FOUND",
        message: `Service ${namespace}/${name} not found`,
      },
    };
  }
}

async function checkPod(core: Core, namespace: string, name: string): Promise<ResourceCheckResult> {
  try {
    const pod = await core.readNamespacedPod({ name, namespace });
    const phase = pod.status?.phase;
    const containerStatuses = pod.status?.containerStatuses || [];
    const readyContainers = containerStatuses.filter((c) => c.ready).length;
    const totalContainers = containerStatuses.length;

    if (phase === "Running" && readyContainers === totalContainers) {
      return {
        readyReplicas: 1,
        desiredReplicas: 1,
        message: `Pod is Running with all ${totalContainers} containers ready`,
      };
    }
    return {
      readyReplicas: readyContainers,
      desiredReplicas: totalContainers,
      message: `Pod is ${phase} with ${readyContainers}/${totalContainers} containers ready`,
    };
  } catch {
    return {
      error: { reason: "K8S_POD_NOT_FOUND", message: `Pod ${namespace}/${name} not found` },
    };
  }
}

function checkResource(
  client: Awaited<ReturnType<typeof getKubernetesClient>>,
  kind: string,
  namespace: string,
  name: string,
): Promise<ResourceCheckResult> {
  switch (kind) {
    case "Deployment":
      return checkDeployment(client.apps, namespace, name);
    case "StatefulSet":
      return checkStatefulSet(client.apps, namespace, name);
    case "Service":
      return checkService(client.core, namespace, name);
    case "Pod":
      return checkPod(client.core, namespace, name);
    default:
      return Promise.resolve({
        error: { reason: "INVALID_CONFIG", message: `Unsupported Kubernetes kind: ${kind}` },
      });
  }
}

export async function checkKubernetes(monitor: Monitor, _timeout: number): Promise<CheckResult> {
  const spec = monitor.spec;
  const target =
    spec.target.kubernetes ??
    (spec.target.k8s
      ? {
          namespace: monitor.metadata.namespace,
          name: spec.target.k8s.resource.name,
          kind: spec.target.k8s.resource.kind,
          minReadyReplicas: spec.target.k8s.check.min,
        }
      : undefined);

  if (!target) {
    return {
      state: "down",
      latencyMs: 0,
      reason: "INVALID_CONFIG",
      message: "No Kubernetes target configured",
    };
  }

  const startTime = Date.now();

  try {
    const client = await getKubernetesClient();
    const { namespace, name, kind } = target;

    if (!namespace || !name || !kind) {
      return {
        state: "down",
        latencyMs: 0,
        reason: "INVALID_CONFIG",
        message: "Kubernetes target must have namespace, name, and kind",
      };
    }

    const checkResult = await checkResource(client, kind, namespace, name);
    const latencyMs = Date.now() - startTime;

    if ("error" in checkResult) {
      return { state: "down", latencyMs, ...checkResult.error };
    }

    const minReplicas = target.minReadyReplicas || 1;
    if (checkResult.readyReplicas >= minReplicas && checkResult.readyReplicas > 0) {
      return {
        state: "up",
        latencyMs,
        reason: "K8S_HEALTHY",
        message: checkResult.message,
      };
    }
    return {
      state: "down",
      latencyMs,
      reason: "K8S_UNHEALTHY",
      message: `${checkResult.message} (minimum required: ${minReplicas})`,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.warn({ monitor: monitor.metadata.name, error }, "Kubernetes check failed");

    return {
      state: "down",
      latencyMs,
      reason: "ERROR",
      message: error instanceof Error ? error.message : "Kubernetes check failed",
    };
  }
}
