/**
 * In-memory CRD cache
 * Replaces database-based CRD cache for fast access to CRD specs
 *
 * Note: Resources are stored as plain objects from Kubernetes API.
 * Use Zod schemas in reconcilers to validate and type-cast when accessing.
 * Example: const monitor = MonitorSchema.parse(cachedResource);
 */

import { logger } from "./logger";

/**
 * Cached CRD resource
 */
export interface CachedResource {
  kind: string;
  apiVersion: string;
  namespace: string;
  name: string;
  generation: number;
  resourceVersion: string;
  spec: unknown; // Use Zod to parse and validate
  status: unknown; // Use Zod to parse and validate
  labels: Record<string, string>;
  annotations: Record<string, string>;
  updatedAt: Date;
}

/**
 * In-memory cache store
 */
const crdCache = new Map<string, CachedResource>();

/**
 * Generate cache key
 */
function cacheKey(kind: string, namespace: string, name: string): string {
  return `${kind}:${namespace}:${name}`;
}

/**
 * Cache a resource
 * Resources should be validated with Zod schemas when retrieved
 */
export function cacheResource(resource: unknown): void {
  try {
    if (typeof resource !== "object" || resource === null) {
      return;
    }

    const r = resource as Record<string, unknown>;
    const kind = r.kind as string;
    const metadata = r.metadata as Record<string, unknown> | undefined;
    const namespace = (metadata?.namespace as string) || "";
    const name = metadata?.name as string;
    const key = cacheKey(kind, namespace, name);

    const cached: CachedResource = {
      kind,
      apiVersion: r.apiVersion as string,
      namespace,
      name,
      generation: (metadata?.generation as number) || 0,
      resourceVersion: (metadata?.resourceVersion as string) || "",
      spec: r.spec,
      status: r.status,
      labels: (metadata?.labels as Record<string, string>) || {},
      annotations: (metadata?.annotations as Record<string, string>) || {},
      updatedAt: new Date(),
    };

    crdCache.set(key, cached);
  } catch (error) {
    logger.debug({ error }, "Failed to cache resource");
  }
}

/**
 * Update cached resource
 */
export function updateCachedResource(resource: unknown): void {
  cacheResource(resource); // Same logic - just overwrite
}

/**
 * Remove cached resource
 */
export function removeCachedResource(kind: string, namespace: string, name: string): void {
  const key = cacheKey(kind, namespace, name);
  crdCache.delete(key);
}

/**
 * Get cached resource
 */
export function getCachedResource(
  kind: string,
  namespace: string,
  name: string,
): CachedResource | null {
  const key = cacheKey(kind, namespace, name);
  return crdCache.get(key) || null;
}

/**
 * Get all cached resources of a kind
 */
export function getCachedResourcesByKind(kind: string): CachedResource[] {
  const results: CachedResource[] = [];
  for (const [key, resource] of crdCache.entries()) {
    if (key.startsWith(`${kind}:`)) {
      results.push(resource);
    }
  }
  return results;
}

/**
 * Clear all cached resources
 */
export function clearCache(): void {
  crdCache.clear();
}

/**
 * Get cache size (for monitoring)
 */
export function getCacheSize(): number {
  return crdCache.size;
}
