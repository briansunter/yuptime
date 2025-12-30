/**
 * DNS resolution utility for external endpoint testing
 *
 * By default, uses external DNS resolvers (8.8.8.8, 1.1.1.1) to ensure
 * requests go through the full external path (DNS → Load Balancer → Ingress).
 */

import { Resolver } from "node:dns/promises";
import { logger } from "./logger";

export const DEFAULT_EXTERNAL_RESOLVERS = ["8.8.8.8", "1.1.1.1"];

export interface DnsConfig {
  /** Use system DNS resolver instead of external resolvers */
  useSystemResolver?: boolean;
  /** Custom DNS resolvers to use (overrides default external resolvers) */
  resolvers?: string[];
}

export interface ResolveOptions {
  /** DNS configuration from monitor or global settings */
  config?: DnsConfig;
  /** Whether to default to external DNS (true for HTTP, false for TCP/gRPC/databases) */
  defaultToExternal?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Resolve a hostname using configured DNS resolvers
 *
 * @param hostname - The hostname to resolve
 * @param options - Resolution options
 * @returns The resolved IP address, or the original hostname if using system resolver
 */
export async function resolveHostname(
  hostname: string,
  options: ResolveOptions = {},
): Promise<string> {
  const { config, defaultToExternal = true, timeoutMs = 5000 } = options;

  // If useSystemResolver is explicitly true, return hostname as-is (let system resolve)
  if (config?.useSystemResolver) {
    logger.debug({ hostname }, "Using system DNS resolver");
    return hostname;
  }

  // Determine resolvers to use
  const resolvers =
    config?.resolvers ?? (defaultToExternal ? DEFAULT_EXTERNAL_RESOLVERS : undefined);

  // If no resolvers specified and not defaulting to external, use system DNS
  if (!resolvers || resolvers.length === 0) {
    logger.debug({ hostname }, "Using system DNS resolver (no custom resolvers configured)");
    return hostname;
  }

  // Skip resolution for IP addresses
  if (isIPAddress(hostname)) {
    logger.debug({ hostname }, "Hostname is already an IP address, skipping DNS resolution");
    return hostname;
  }

  try {
    const resolver = new Resolver();
    resolver.setServers(resolvers);

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`DNS resolution timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    // Race between resolution and timeout
    const addresses = await Promise.race([resolver.resolve4(hostname), timeoutPromise]);

    const resolvedIp = addresses[0];
    if (!resolvedIp) {
      throw new Error(`No A records found for ${hostname}`);
    }

    logger.debug({ hostname, resolvedIp, resolvers }, "Resolved hostname using external DNS");

    return resolvedIp;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.warn(
      { hostname, resolvers, error: errorMessage },
      "DNS resolution failed, falling back to system resolver",
    );

    // Fall back to returning the original hostname (system will resolve it)
    return hostname;
  }
}

/**
 * Check if a string is an IP address (v4 or v6)
 */
function isIPAddress(hostname: string): boolean {
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(hostname)) {
    return true;
  }

  // IPv6 pattern (simplified - includes :: notation)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (ipv6Pattern.test(hostname)) {
    return true;
  }

  // IPv6 with brackets (as used in URLs)
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return true;
  }

  return false;
}

/**
 * Get DNS configuration from environment variables
 * Used by checker executor to receive config from job-builder
 */
export function getDnsConfigFromEnv(): DnsConfig | undefined {
  const useSystemResolver = process.env.YUPTIME_DNS_USE_SYSTEM === "true";
  const resolversEnv = process.env.YUPTIME_DNS_RESOLVERS;

  if (!useSystemResolver && !resolversEnv) {
    return undefined;
  }

  return {
    useSystemResolver,
    resolvers: resolversEnv ? resolversEnv.split(",").filter(Boolean) : undefined,
  };
}
