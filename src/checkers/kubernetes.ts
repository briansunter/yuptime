/**
 * Kubernetes endpoint health checker
 *
 * Monitors pod and endpoint status within a Kubernetes cluster
 * Can check: pod running status, endpoint readiness, deployment replicas
 */

import { logger } from "../lib/logger";
import { getKubernetesClient } from "../controller/k8s-client";
import type { Monitor } from "../types/crd";
import type { CheckResult } from "./index";

export async function checkKubernetes(
  monitor: Monitor,
  timeout: number
): Promise<CheckResult> {
  const spec = monitor.spec;
  const target = spec.target.kubernetes;

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
    const k8sApi = client.apps;
    const coreApi = client.core;

    const { namespace, name, kind } = target;

    if (!namespace || !name || !kind) {
      return {
        state: "down",
        latencyMs: 0,
        reason: "INVALID_CONFIG",
        message: "Kubernetes target must have namespace, name, and kind",
      };
    }

    let readyReplicas = 0;
    let desiredReplicas = 0;
    let message = "";

    // Check based on resource kind
    if (kind === "Deployment") {
      try {
        const deployment = await k8sApi.readNamespacedDeployment(
          name,
          namespace
        );

        desiredReplicas = deployment.spec?.replicas || 1;
        readyReplicas = deployment.status?.readyReplicas || 0;

        if (readyReplicas === desiredReplicas) {
          message = `Deployment has ${readyReplicas}/${desiredReplicas} ready replicas`;
        } else {
          message = `Deployment degraded: ${readyReplicas}/${desiredReplicas} ready replicas`;
        }
      } catch (error) {
        return {
          state: "down",
          latencyMs: Date.now() - startTime,
          reason: "K8S_DEPLOYMENT_NOT_FOUND",
          message: `Deployment ${namespace}/${name} not found`,
        };
      }
    } else if (kind === "StatefulSet") {
      try {
        const statefulSet = await k8sApi.readNamespacedStatefulSet(
          name,
          namespace
        );

        desiredReplicas = statefulSet.spec?.replicas || 1;
        readyReplicas = statefulSet.status?.readyReplicas || 0;

        if (readyReplicas === desiredReplicas) {
          message = `StatefulSet has ${readyReplicas}/${desiredReplicas} ready replicas`;
        } else {
          message = `StatefulSet degraded: ${readyReplicas}/${desiredReplicas} ready replicas`;
        }
      } catch (error) {
        return {
          state: "down",
          latencyMs: Date.now() - startTime,
          reason: "K8S_STATEFULSET_NOT_FOUND",
          message: `StatefulSet ${namespace}/${name} not found`,
        };
      }
    } else if (kind === "Endpoint") {
      try {
        const endpoint = await coreApi.readNamespacedEndpoints(name, namespace);

        const readyAddresses = endpoint.subsets?.reduce((acc, subset) => {
          return acc + (subset.addresses?.length || 0);
        }, 0) || 0;

        if (readyAddresses > 0) {
          message = `Endpoint has ${readyAddresses} ready addresses`;
        } else {
          message = "Endpoint has no ready addresses";
        }

        readyReplicas = readyAddresses;
        desiredReplicas = 1; // At least one address expected
      } catch (error) {
        return {
          state: "down",
          latencyMs: Date.now() - startTime,
          reason: "K8S_ENDPOINT_NOT_FOUND",
          message: `Endpoint ${namespace}/${name} not found`,
        };
      }
    } else if (kind === "Pod") {
      try {
        const pod = await coreApi.readNamespacedPod(name, namespace);

        const phase = pod.status?.phase;
        const containerStatuses = pod.status?.containerStatuses || [];

        const readyContainers = containerStatuses.filter(
          (c) => c.ready
        ).length;
        const totalContainers = containerStatuses.length;

        if (phase === "Running" && readyContainers === totalContainers) {
          message = `Pod is Running with all ${totalContainers} containers ready`;
          readyReplicas = 1;
          desiredReplicas = 1;
        } else {
          message = `Pod is ${phase} with ${readyContainers}/${totalContainers} containers ready`;
          readyReplicas = readyContainers;
          desiredReplicas = totalContainers;
        }
      } catch (error) {
        return {
          state: "down",
          latencyMs: Date.now() - startTime,
          reason: "K8S_POD_NOT_FOUND",
          message: `Pod ${namespace}/${name} not found`,
        };
      }
    } else {
      return {
        state: "down",
        latencyMs: 0,
        reason: "INVALID_CONFIG",
        message: `Unsupported Kubernetes kind: ${kind}`,
      };
    }

    const latencyMs = Date.now() - startTime;

    // Check minimum replicas requirement if specified
    const minReplicas = target.minReadyReplicas || 1;
    if (readyReplicas >= minReplicas && readyReplicas > 0) {
      return {
        state: "up",
        latencyMs,
        reason: "K8S_HEALTHY",
        message,
      };
    } else {
      return {
        state: "down",
        latencyMs,
        reason: "K8S_UNHEALTHY",
        message: `${message} (minimum required: ${minReplicas})`,
      };
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.warn(
      { monitor: monitor.metadata.name, error },
      "Kubernetes check failed"
    );

    return {
      state: "down",
      latencyMs,
      reason: "ERROR",
      message: error instanceof Error ? error.message : "Kubernetes check failed",
    };
  }
}
