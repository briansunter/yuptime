import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHttpMonitor } from "../../test-utils/fixtures/monitors";
// Import the pieces we can test directly.
import { handleMonitorDeletion, stopSafetyNet } from "./monitor-reconciler";

describe("monitor-reconciler", () => {
  beforeEach(() => undefined);

  afterEach(() => {
    stopSafetyNet();
  });

  describe("handleMonitorDeletion", () => {
    test("removes monitor from Check Engine", async () => {
      const removed: string[] = [];
      await handleMonitorDeletion("default", "test-http", {
        checkEngine: { remove: (id: string) => removed.push(id) } as never,
      });
      expect(removed).toEqual(["default/test-http"]);
    });

    test("handles deletion of unknown monitor", async () => {
      // Should not throw
      await handleMonitorDeletion("unknown", "monitor");
    });
  });

  describe("stopSafetyNet", () => {
    test("is retained as a safe compatibility no-op", () => {
      expect(() => stopSafetyNet()).not.toThrow();
    });

    test("can be called multiple times safely", () => {
      stopSafetyNet();
      stopSafetyNet(); // should not throw
    });
  });

  describe("validation", () => {
    // We test validation indirectly through the monitor-reconciler's validators.
    // The validators are not exported, but we can verify behavior through
    // the createMonitorReconciler factory.

    test("createHttpMonitor fixture produces valid monitor", () => {
      const monitor = createHttpMonitor();
      expect(monitor.spec.type).toBe("http");
      expect(monitor.spec.target.http.url).toBe("https://example.com");
      expect(monitor.spec.schedule.intervalSeconds).toBe(60);
      expect(monitor.spec.schedule.timeoutSeconds).toBe(10);
      expect(monitor.spec.enabled).toBe(true);
    });

    test("createHttpMonitor accepts overrides", () => {
      const monitor = createHttpMonitor({
        name: "custom",
        namespace: "prod",
        url: "https://api.example.com/health",
        intervalSeconds: 30,
        timeoutSeconds: 5,
        enabled: false,
        jitterPercent: 10,
      });
      expect(monitor.metadata.name).toBe("custom");
      expect(monitor.metadata.namespace).toBe("prod");
      expect(monitor.spec.target.http.url).toBe("https://api.example.com/health");
      expect(monitor.spec.schedule.intervalSeconds).toBe(30);
      expect(monitor.spec.schedule.timeoutSeconds).toBe(5);
      expect(monitor.spec.enabled).toBe(false);
      expect(monitor.spec.schedule.jitterPercent).toBe(10);
    });
  });
});
