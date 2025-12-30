import { describe, expect, test } from "bun:test";
import type { YuptimeSettings } from "../../types/crd";
import { createDiscoveryController } from "./index";

// Create a minimal settings object for testing
function createMockSettings(overrides?: {
  enabled?: boolean;
  sources?: Array<{ type: "ingress" | "service" | "gatewayapi" }>;
  writeCrds?: boolean;
  defaultHealthPath?: string;
}): YuptimeSettings {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "YuptimeSettings",
    metadata: {
      name: "yuptime",
    },
    spec: {
      mode: {
        gitOpsReadOnly: false,
        singleInstanceRequired: true,
      },
      scheduler: {
        minIntervalSeconds: 20,
        maxConcurrentNetChecks: 200,
        maxConcurrentPrivChecks: 20,
        defaultTimeoutSeconds: 10,
        jitterPercent: 5,
      },
      networking: {
        userAgent: "Yuptime/1.0",
      },
      discovery: {
        enabled: overrides?.enabled ?? false,
        sources: overrides?.sources ?? [],
        behavior: {
          showSuggestionsInUi: true,
          writeCrds: overrides?.writeCrds ?? false,
          defaultHealthPath: overrides?.defaultHealthPath ?? "/healthz",
        },
      },
    },
  };
}

describe("createDiscoveryController", () => {
  test("returns no-op controller when discovery is disabled", async () => {
    const settings = createMockSettings({ enabled: false });
    const controller = createDiscoveryController(settings);

    // Should not throw
    await controller.start();
    controller.stop();
  });

  test("returns no-op controller when discovery is undefined", async () => {
    const settings = createMockSettings({ enabled: false });
    // Remove the discovery section to test undefined case
    (settings.spec as Record<string, unknown>).discovery = undefined;

    const controller = createDiscoveryController(settings);

    // Should not throw
    await controller.start();
    controller.stop();
  });

  test("returns controller with start/stop methods when enabled", () => {
    const settings = createMockSettings({
      enabled: true,
      sources: [{ type: "service" }],
    });
    const controller = createDiscoveryController(settings);

    expect(typeof controller.start).toBe("function");
    expect(typeof controller.stop).toBe("function");
  });

  test("extracts config correctly with defaults", () => {
    const settings = createMockSettings({ enabled: true });
    const controller = createDiscoveryController(settings);

    // Controller should be created without error
    expect(controller).toBeDefined();
  });

  test("extracts config correctly with custom values", () => {
    const settings = createMockSettings({
      enabled: true,
      sources: [{ type: "service" }, { type: "ingress" }],
      writeCrds: true,
      defaultHealthPath: "/health",
    });
    const controller = createDiscoveryController(settings);

    expect(controller).toBeDefined();
  });
});
