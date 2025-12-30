import { logger } from "../../lib/logger";
import type { YuptimeSettings } from "../../types/crd";
import { startIngressWatcher, stopIngressWatcher } from "./ingress-watcher";
import { startServiceWatcher, stopServiceWatcher } from "./service-watcher";

export interface DiscoveryConfig {
  enabled: boolean;
  sources: Array<{ type: "ingress" | "service" | "gatewayapi" }>;
  behavior: {
    writeCrds: boolean;
    defaultHealthPath: string;
  };
}

/**
 * Extract discovery config from YuptimeSettings with defaults
 */
function extractConfig(settings: YuptimeSettings): DiscoveryConfig {
  const discovery = settings.spec.discovery;

  return {
    enabled: discovery?.enabled ?? false,
    sources: discovery?.sources ?? [],
    behavior: {
      writeCrds: discovery?.behavior?.writeCrds ?? false,
      defaultHealthPath: discovery?.behavior?.defaultHealthPath ?? "/healthz",
    },
  };
}

/**
 * Create the discovery controller
 * Watches Services and Ingresses for monitoring annotations and auto-creates Monitor CRDs
 */
export function createDiscoveryController(settings: YuptimeSettings) {
  const config = extractConfig(settings);

  if (!config.enabled) {
    logger.info("Discovery disabled in settings");
    return {
      start: async () => {
        // No-op when discovery is disabled
      },
      stop: () => {
        // No-op when discovery is disabled
      },
    };
  }

  logger.info({ sources: config.sources }, "Discovery enabled");

  return {
    start: async () => {
      for (const source of config.sources) {
        switch (source.type) {
          case "service":
            await startServiceWatcher(config);
            logger.info("Started Service watcher for auto-discovery");
            break;

          case "ingress":
            await startIngressWatcher(config);
            logger.info("Started Ingress watcher for auto-discovery");
            break;

          case "gatewayapi":
            logger.warn("Gateway API discovery not yet implemented");
            break;
        }
      }
    },
    stop: () => {
      stopServiceWatcher();
      stopIngressWatcher();
      logger.info("Stopped discovery watchers");
    },
  };
}
