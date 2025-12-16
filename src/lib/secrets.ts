import { KubeConfig, V1Secret } from "@kubernetes/client-node";
import { logger } from "./logger";

let kubeClient: any;

export async function initializeK8sClient() {
  const kc = new KubeConfig();
  kc.loadFromDefault();
  kubeClient = kc;
  logger.info("Kubernetes client initialized");
}

export function getK8sClient() {
  if (!kubeClient) {
    throw new Error("Kubernetes client not initialized");
  }
  return kubeClient;
}

/**
 * Resolve a secret reference from Kubernetes
 * Returns the value of the specified key from the secret
 */
export async function resolveSecret(
  namespace: string,
  secretName: string,
  key: string
): Promise<string> {
  try {
    const kc = getK8sClient();
    const api = kc.makeApiClient(require("@kubernetes/client-node").CoreV1Api);
    const secret = await api.readNamespacedSecret(secretName, namespace);

    if (!secret.data || !secret.data[key]) {
      throw new Error(`Key '${key}' not found in secret '${secretName}'`);
    }

    // Secret data is base64 encoded
    const value = Buffer.from(secret.data[key], "base64").toString("utf-8");
    return value;
  } catch (error) {
    logger.error(
      { namespace, secretName, key, error },
      "Failed to resolve secret"
    );
    throw new Error(`Failed to resolve secret: ${secretName}/${key}`);
  }
}

/**
 * Batch resolve multiple secrets for performance
 */
export async function resolveSecrets(
  refs: Array<{ namespace: string; name: string; key: string }>
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (const ref of refs) {
    const id = `${ref.namespace}/${ref.name}:${ref.key}`;
    try {
      results[id] = await resolveSecret(ref.namespace, ref.name, ref.key);
    } catch (error) {
      logger.warn({ ref }, "Failed to resolve secret in batch");
    }
  }

  return results;
}

/**
 * Cache for secrets to avoid repeated K8s API calls
 * In production, consider using a proper cache like Redis
 */
const secretCache = new Map<string, { value: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function resolveSecretCached(
  namespace: string,
  secretName: string,
  key: string
): Promise<string> {
  const cacheKey = `${namespace}/${secretName}:${key}`;
  const cached = secretCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  const value = await resolveSecret(namespace, secretName, key);
  secretCache.set(cacheKey, { value, timestamp: Date.now() });
  return value;
}

export function clearSecretCache() {
  secretCache.clear();
}

export function getSecretCacheStats() {
  return {
    size: secretCache.size,
    items: Array.from(secretCache.keys()),
  };
}
