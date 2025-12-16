import {
  KubeConfig,
  Watch,
  makeInformer,
  ListPromise,
  ObjectFieldSelector,
} from "@kubernetes/client-node";
import { logger } from "../lib/logger";

let kubeConfig: KubeConfig;

/**
 * Initialize Kubernetes client from environment
 * Supports both in-cluster and kubeconfig file
 */
export function initializeK8sClient(): KubeConfig {
  if (kubeConfig) return kubeConfig;

  kubeConfig = new KubeConfig();

  try {
    // Try to load from in-cluster config first
    kubeConfig.loadFromCluster();
    logger.info("Kubernetes client: using in-cluster configuration");
  } catch (error) {
    // Fall back to kubeconfig file
    try {
      kubeConfig.loadFromDefault();
      logger.info("Kubernetes client: using kubeconfig file");
    } catch (error) {
      logger.error("Failed to initialize Kubernetes client");
      throw new Error(
        "Kubernetes client initialization failed. Ensure running in cluster or KUBECONFIG is set."
      );
    }
  }

  return kubeConfig;
}

export function getK8sClient(): KubeConfig {
  if (!kubeConfig) {
    throw new Error("Kubernetes client not initialized");
  }
  return kubeConfig;
}

/**
 * Create a Custom Resource Definition watcher
 */
export function createCRDWatcher(
  group: string,
  version: string,
  plural: string,
  namespace: string = ""
) {
  const kc = getK8sClient();

  return {
    /**
     * List all CRDs of this type
     */
    async list(): Promise<any[]> {
      const client = kc.makeApiClient(require("@kubernetes/client-node").CustomObjectsApi);

      try {
        const response = namespace
          ? await client.listNamespacedCustomObject(group, version, namespace, plural)
          : await client.listClusterCustomObject(group, version, plural);

        return (response as any).items || [];
      } catch (error) {
        logger.error({ group, version, plural, namespace, error }, "Failed to list CRDs");
        throw error;
      }
    },

    /**
     * Get a single CRD
     */
    async get(name: string, ns?: string) {
      const client = kc.makeApiClient(require("@kubernetes/client-node").CustomObjectsApi);

      try {
        return ns
          ? await client.getNamespacedCustomObject(group, version, ns, plural, name)
          : await client.getClusterCustomObject(group, version, plural, name);
      } catch (error) {
        logger.error({ group, version, plural, name, namespace: ns, error }, "Failed to get CRD");
        throw error;
      }
    },

    /**
     * Create a CRD
     */
    async create(body: any, ns?: string) {
      const client = kc.makeApiClient(require("@kubernetes/client-node").CustomObjectsApi);

      try {
        return ns
          ? await client.createNamespacedCustomObject(group, version, ns, plural, body)
          : await client.createClusterCustomObject(group, version, plural, body);
      } catch (error) {
        logger.error({ group, version, plural, namespace: ns, error }, "Failed to create CRD");
        throw error;
      }
    },

    /**
     * Update a CRD
     */
    async patch(name: string, body: any, ns?: string) {
      const client = kc.makeApiClient(require("@kubernetes/client-node").CustomObjectsApi);

      try {
        return ns
          ? await client.patchNamespacedCustomObject(group, version, ns, plural, name, body)
          : await client.patchClusterCustomObject(group, version, plural, name, body);
      } catch (error) {
        logger.error(
          { group, version, plural, name, namespace: ns, error },
          "Failed to patch CRD"
        );
        throw error;
      }
    },

    /**
     * Update status subresource
     */
    async patchStatus(name: string, body: any, ns?: string) {
      const client = kc.makeApiClient(require("@kubernetes/client-node").CustomObjectsApi);

      try {
        return ns
          ? await client.patchNamespacedCustomObjectStatus(
              group,
              version,
              ns,
              plural,
              name,
              body
            )
          : await client.patchClusterCustomObjectStatus(group, version, plural, name, body);
      } catch (error) {
        logger.error(
          { group, version, plural, name, namespace: ns, error },
          "Failed to patch CRD status"
        );
        throw error;
      }
    },

    /**
     * Delete a CRD
     */
    async delete(name: string, ns?: string) {
      const client = kc.makeApiClient(require("@kubernetes/client-node").CustomObjectsApi);

      try {
        return ns
          ? await client.deleteNamespacedCustomObject(group, version, ns, plural, name)
          : await client.deleteClusterCustomObject(group, version, plural, name);
      } catch (error) {
        logger.error(
          { group, version, plural, name, namespace: ns, error },
          "Failed to delete CRD"
        );
        throw error;
      }
    },

    /**
     * Watch for changes to CRDs
     */
    async watch(
      onEvent: (type: string, obj: any) => void,
      onError?: (error: Error) => void,
      ns?: string
    ) {
      const kc = getK8sClient();
      const path = ns
        ? `/apis/${group}/${version}/namespaces/${ns}/${plural}`
        : `/apis/${group}/${version}/${plural}`;

      const watch = new Watch(kc);

      return watch.watch(
        path,
        {},
        (phase, obj) => {
          onEvent(phase, obj);
        },
        onError || (() => {})
      );
    },
  };
}

/**
 * Get Core API client for Secrets, ConfigMaps, etc.
 */
export function getCoreApiClient() {
  const kc = getK8sClient();
  return kc.makeApiClient(require("@kubernetes/client-node").CoreV1Api);
}

/**
 * Get Apps API client for Deployments, StatefulSets, etc.
 */
export function getAppsApiClient() {
  const kc = getK8sClient();
  return kc.makeApiClient(require("@kubernetes/client-node").AppsV1Api);
}

/**
 * Get Coordination API client for Leases
 */
export function getCoordinationApiClient() {
  const kc = getK8sClient();
  return kc.makeApiClient(require("@kubernetes/client-node").CoordinationV1Api);
}
