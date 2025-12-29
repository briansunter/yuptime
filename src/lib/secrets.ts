import fs from "node:fs";
import { KubeConfig } from "@kubernetes/client-node";
import { logger } from "./logger";

// In-cluster paths
const SA_TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token";

let kubeClient: KubeConfig | null = null;
let inClusterToken: string | null = null;

/**
 * Get or initialize K8s client (lazy initialization)
 */
function getK8sClient(): KubeConfig {
  if (!kubeClient) {
    kubeClient = new KubeConfig();
    try {
      // Try in-cluster config first
      kubeClient.loadFromCluster();
      // Also read the token directly for use in fetch calls
      if (fs.existsSync(SA_TOKEN_PATH)) {
        inClusterToken = fs.readFileSync(SA_TOKEN_PATH, "utf-8").trim();
        logger.debug({ tokenLength: inClusterToken.length }, "Secrets: Loaded in-cluster token");
      }
      logger.debug("Secrets: Using in-cluster K8s configuration");
    } catch {
      // Fall back to default (kubeconfig file)
      kubeClient.loadFromDefault();
      logger.debug("Secrets: Using default K8s configuration");
    }
  }
  return kubeClient;
}

/**
 * Get the authentication token for K8s API calls
 */
function getToken(): string | undefined {
  // Use in-cluster token if available
  if (inClusterToken) {
    return inClusterToken;
  }
  // Fall back to user token from kubeconfig
  const kc = getK8sClient();
  const user = kc.getCurrentUser();
  return user?.token;
}

/**
 * Resolve a secret reference from Kubernetes
 * Returns the value of the specified key from the secret
 * Uses direct fetch with TLS workaround for self-signed certs
 */
export async function resolveSecret(
  namespace: string,
  secretName: string,
  key: string,
): Promise<string> {
  try {
    const kc = getK8sClient();
    const cluster = kc.getCurrentCluster();
    if (!cluster) {
      throw new Error("No current cluster configured");
    }

    const token = getToken();

    logger.debug(
      {
        hasCluster: !!cluster,
        server: cluster.server,
        hasToken: !!token,
        tokenLength: token?.length || 0,
      },
      "K8s client config",
    );

    const url = `${cluster.server}/api/v1/namespaces/${namespace}/secrets/${secretName}`;

    logger.debug({ namespace, secretName, key, url }, "Resolving secret from K8s");

    // Use fetch with TLS workaround for self-signed certs (like controller does)
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { status: response.status, statusText: response.statusText, errorText },
        "HTTP error from K8s",
      );
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    const secret = (await response.json()) as { data?: Record<string, string> };

    if (!secret.data || !secret.data[key]) {
      throw new Error(`Key '${key}' not found in secret '${secretName}'`);
    }

    // Secret data is base64 encoded
    const value = Buffer.from(secret.data[key], "base64").toString("utf-8");
    logger.debug({ secretName, key, valueLength: value.length }, "Secret resolved successfully");
    return value;
  } catch (error: unknown) {
    // Type narrow to access error properties
    const err = error as { message?: string; stack?: string };

    logger.error(
      {
        namespace,
        secretName,
        key,
        errorMessage: err?.message,
        errorStack: err?.stack,
      },
      "Failed to resolve secret",
    );
    throw new Error(`Failed to resolve secret: ${secretName}/${key}`);
  }
}

/**
 * Batch resolve multiple secrets for performance
 */
export async function resolveSecrets(
  refs: Array<{ namespace: string; name: string; key: string }>,
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (const ref of refs) {
    const id = `${ref.namespace}/${ref.name}:${ref.key}`;
    try {
      results[id] = await resolveSecret(ref.namespace, ref.name, ref.key);
    } catch (_error) {
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
  key: string,
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
