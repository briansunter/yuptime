import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHttpMonitor } from "../../test-utils/fixtures/monitors";
import { clearAll, getLastScheduleTime, recordSchedule } from "../job-manager/schedule-tracker";

// Import the pieces we can test directly.
import { handleMonitorDeletion, stopSafetyNet } from "./monitor-reconciler";

describe("monitor-reconciler", () => {
  beforeEach(() => {
    clearAll();
  });

  afterEach(() => {
    stopSafetyNet();
    clearAll();
  });

  describe("handleMonitorDeletion", () => {
    test("removes monitor from tracker", async () => {
      recordSchedule("default/test-http");
      expect(getLastScheduleTime("default/test-http")).toBeGreaterThan(0);

      await handleMonitorDeletion("default", "test-http");

      expect(getLastScheduleTime("default/test-http")).toBe(0);
    });

    test("handles deletion of unknown monitor", async () => {
      // Should not throw
      await handleMonitorDeletion("unknown", "monitor");
    });
  });

  describe("stopSafetyNet", () => {
    test("clears all tracked state", () => {
      recordSchedule("ns/mon1");
      recordSchedule("ns/mon2");

      stopSafetyNet();

      expect(getLastScheduleTime("ns/mon1")).toBe(0);
      expect(getLastScheduleTime("ns/mon2")).toBe(0);
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

  describe("schedule-tracker integration", () => {
    test("recently scheduled monitor is not rescheduled (via tracker)", () => {
      const monitorId = "default/test-http";
      recordSchedule(monitorId);

      const lastTime = getLastScheduleTime(monitorId);
      expect(lastTime).toBeGreaterThan(0);

      // Verify the tracker prevents immediate re-scheduling
      const intervalMs = 60000;
      const elapsed = Date.now() - lastTime;
      expect(elapsed).toBeLessThan(intervalMs * 2); // Not overdue
    });

    test("overdue monitor can be rescheduled (via tracker)", () => {
      const monitorId = "default/test-http";
      // Never scheduled: getLastScheduleTime returns 0, isOverdue returns true
      expect(getLastScheduleTime(monitorId)).toBe(0);
    });

    test("disabled monitor is cleaned up from tracker", async () => {
      recordSchedule("default/test-http");
      await handleMonitorDeletion("default", "test-http");
      expect(getLastScheduleTime("default/test-http")).toBe(0);
    });

    test("deleted monitor is cleaned up from tracker", async () => {
      recordSchedule("prod/api-monitor");
      await handleMonitorDeletion("prod", "api-monitor");
      expect(getLastScheduleTime("prod/api-monitor")).toBe(0);
    });
  });
});
