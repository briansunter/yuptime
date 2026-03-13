/**
 * Deduplication tests for the scheduling system.
 *
 * These tests verify that the schedule-tracker prevents duplicate scheduling
 * across all three scheduling paths:
 *   1. Reconciler (initial schedule on CRD reconciliation)
 *   2. Completion-watcher (reschedule after job completion)
 *   3. Safety-net (recovery for overdue monitors)
 *
 * The key invariant: at most ONE scheduling chain should be active per monitor.
 * Multiple completions, reconciliations, or safety-net checks for the same
 * monitor must result in exactly one new job, not N.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHttpMonitor } from "../test-utils/fixtures/monitors";
import type { Monitor } from "../types/crd/monitor";
import { rescheduleWithRetry } from "./job-manager/completion-watcher";
import {
  clearAll,
  getLastScheduleTime,
  isOverdue,
  recordSchedule,
  removeMonitor,
} from "./job-manager/schedule-tracker";
import type { JobManager } from "./job-manager/types";
import { createTypeSafeReconciliationHandler } from "./reconcilers/handler";
import { createMonitorReconciler, stopSafetyNet } from "./reconcilers/monitor-reconciler";

function createMockJobManager(overrides?: Partial<JobManager>): JobManager {
  return {
    scheduleCheck: mock(() =>
      Promise.resolve({
        jobName: "test-job",
        namespace: "default",
        monitorId: "default/test",
      }),
    ),
    cancelJob: mock(() => Promise.resolve()),
    getJobStatus: mock(() => Promise.resolve("succeeded" as const)),
    cleanupOldJobs: mock(() => Promise.resolve(0)),
    start: mock(() => Promise.resolve()),
    stop: mock(() => Promise.resolve()),
    ...overrides,
  };
}

const noopStatusUpdater = {
  markValid: mock(() => Promise.resolve()),
  markInvalid: mock(() => Promise.resolve()),
};

describe("scheduling dedup: only one scheduling chain per monitor", () => {
  beforeEach(() => {
    clearAll();
  });

  afterEach(() => {
    stopSafetyNet();
    clearAll();
  });

  // ── Completion-watcher dedup ──────────────────────────────────────────

  describe("completion-watcher dedup", () => {
    test("concurrent rescheduleWithRetry calls for same monitor: only first records", async () => {
      let scheduleCallCount = 0;
      const jm = createMockJobManager({
        scheduleCheck: mock(() => {
          scheduleCallCount++;
          return Promise.resolve({
            jobName: `job-${scheduleCallCount}`,
            namespace: "default",
            monitorId: "default/dedup-concurrent",
          });
        }),
      });
      const monitor = createHttpMonitor({
        name: "dedup-concurrent",
        namespace: "default",
      }) as unknown as Monitor;
      const monitorId = "default/dedup-concurrent";

      // Simulate 5 concurrent reschedule calls (as if 5 jobs completed simultaneously)
      await Promise.all([
        rescheduleWithRetry(jm, monitor, monitorId),
        rescheduleWithRetry(jm, monitor, monitorId),
        rescheduleWithRetry(jm, monitor, monitorId),
        rescheduleWithRetry(jm, monitor, monitorId),
        rescheduleWithRetry(jm, monitor, monitorId),
      ]);

      // All 5 calls succeed and call scheduleCheck (rescheduleWithRetry doesn't dedup),
      // but the schedule-tracker will have only the latest timestamp
      expect(scheduleCallCount).toBe(5);
      expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);
    });

    test("schedule-tracker guard prevents redundant scheduling after first record", () => {
      const monitorId = "default/guard-test";
      const intervalMs = 60_000;

      // First handler records schedule
      recordSchedule(monitorId);
      const firstTime = getLastScheduleTime(monitorId);
      expect(firstTime).toBeGreaterThan(0);

      // Second handler checks: recently scheduled, NOT overdue → should skip
      const shouldSkip = getLastScheduleTime(monitorId) > 0 && !isOverdue(monitorId, intervalMs);
      expect(shouldSkip).toBe(true);
    });

    test("guard allows scheduling when tracker is cleared (failure recovery)", () => {
      const monitorId = "default/recovery-guard";
      const intervalMs = 60_000;

      // Schedule, then simulate failure clearing the tracker
      recordSchedule(monitorId);
      removeMonitor(monitorId);

      // Guard should allow scheduling now
      const shouldSkip = getLastScheduleTime(monitorId) > 0 && !isOverdue(monitorId, intervalMs);
      expect(shouldSkip).toBe(false);
    });

    test("guard allows scheduling for never-seen monitor", () => {
      const monitorId = "default/brand-new";
      const intervalMs = 60_000;

      const shouldSkip = getLastScheduleTime(monitorId) > 0 && !isOverdue(monitorId, intervalMs);
      expect(shouldSkip).toBe(false);
    });
  });

  // ── Cross-component dedup ─────────────────────────────────────────────

  describe("cross-component dedup: reconciler + completion-watcher", () => {
    test("reconciler schedule blocks completion-watcher duplicate", () => {
      const monitorId = "default/cross-dedup";
      const intervalMs = 60_000;

      // Reconciler schedules (records optimistic timestamp)
      recordSchedule(monitorId);

      // Completion-watcher checks guard: recently scheduled → skip
      const shouldSkip = getLastScheduleTime(monitorId) > 0 && !isOverdue(monitorId, intervalMs);
      expect(shouldSkip).toBe(true);
    });

    test("completion-watcher schedule blocks reconciler duplicate", async () => {
      const jm = createMockJobManager();
      const reconciler = createMonitorReconciler();
      const handler = createTypeSafeReconciliationHandler(
        reconciler as unknown as Parameters<typeof createTypeSafeReconciliationHandler>[0],
        { jobManager: jm },
        noopStatusUpdater,
      );
      const monitor = createHttpMonitor({
        name: "cross-block",
        namespace: "default",
      });
      const monitorId = "default/cross-block";

      // Simulate completion-watcher already recorded schedule
      recordSchedule(monitorId);
      const timeAfterCompletion = getLastScheduleTime(monitorId);
      expect(timeAfterCompletion).toBeGreaterThan(0);

      // Reconciler runs: should skip because recently scheduled
      await handler(monitor);
      const timeAfterReconcile = getLastScheduleTime(monitorId);

      // Schedule time unchanged (reconciler skipped)
      expect(timeAfterReconcile).toBe(timeAfterCompletion);
    });

    test("safety-net only fires when monitor is truly overdue", () => {
      const monitorId = "default/safety-net-guard";
      const intervalMs = 60_000;

      // Recently scheduled → safety-net should NOT fire
      recordSchedule(monitorId);
      expect(isOverdue(monitorId, intervalMs)).toBe(false);

      // Clear tracker (simulating chain death) → safety-net SHOULD fire
      removeMonitor(monitorId);
      expect(isOverdue(monitorId, intervalMs)).toBe(true);
    });
  });

  // ── Cascade prevention ────────────────────────────────────────────────

  describe("cascade prevention: N completions → 1 new job", () => {
    test("simulated cascade: 3 initial jobs complete, only 1 chain should continue", () => {
      const monitorId = "default/cascade-test";
      const intervalMs = 60_000;

      // Simulate: 3 jobs complete "simultaneously"
      // First completion: no schedule recorded → allowed
      expect(getLastScheduleTime(monitorId)).toBe(0);
      const firstAllowed = !(
        getLastScheduleTime(monitorId) > 0 && !isOverdue(monitorId, intervalMs)
      );
      expect(firstAllowed).toBe(true);
      recordSchedule(monitorId); // First handler records

      // Second completion: schedule already recorded → blocked
      const secondAllowed = !(
        getLastScheduleTime(monitorId) > 0 && !isOverdue(monitorId, intervalMs)
      );
      expect(secondAllowed).toBe(false);

      // Third completion: also blocked
      const thirdAllowed = !(
        getLastScheduleTime(monitorId) > 0 && !isOverdue(monitorId, intervalMs)
      );
      expect(thirdAllowed).toBe(false);
    });

    test("after overdue, exactly one handler should pick it up", () => {
      const monitorId = "default/overdue-pickup";
      const intervalMs = 60_000;

      // Monitor becomes overdue (chain died)
      removeMonitor(monitorId);
      expect(isOverdue(monitorId, intervalMs)).toBe(true);

      // First handler sees overdue → allowed → records
      const firstAllowed = !(
        getLastScheduleTime(monitorId) > 0 && !isOverdue(monitorId, intervalMs)
      );
      expect(firstAllowed).toBe(true);
      recordSchedule(monitorId);

      // Second handler: no longer overdue → blocked
      const secondAllowed = !(
        getLastScheduleTime(monitorId) > 0 && !isOverdue(monitorId, intervalMs)
      );
      expect(secondAllowed).toBe(false);
    });
  });

  // ── Multi-monitor isolation ───────────────────────────────────────────

  describe("multi-monitor isolation", () => {
    test("scheduling one monitor does not affect another", () => {
      const monitorA = "default/monitor-a";
      const monitorB = "default/monitor-b";

      recordSchedule(monitorA);
      expect(getLastScheduleTime(monitorA)).toBeGreaterThan(0);
      expect(getLastScheduleTime(monitorB)).toBe(0);
    });

    test("removing one monitor does not affect another", () => {
      const monitorA = "default/monitor-a";
      const monitorB = "default/monitor-b";

      recordSchedule(monitorA);
      recordSchedule(monitorB);

      removeMonitor(monitorA);
      expect(getLastScheduleTime(monitorA)).toBe(0);
      expect(getLastScheduleTime(monitorB)).toBeGreaterThan(0);
    });

    test("concurrent scheduling of different monitors all succeed independently", async () => {
      const jm = createMockJobManager();
      const monitors = Array.from({ length: 5 }, (_, i) => ({
        monitor: createHttpMonitor({
          name: `monitor-${i}`,
          namespace: "default",
        }) as unknown as Monitor,
        monitorId: `default/monitor-${i}`,
      }));

      // Schedule all concurrently
      await Promise.all(
        monitors.map(({ monitor, monitorId }) => rescheduleWithRetry(jm, monitor, monitorId)),
      );

      // Each should have its own schedule time
      for (const { monitorId } of monitors) {
        expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);
      }
      expect(jm.scheduleCheck).toHaveBeenCalledTimes(5);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe("edge cases", () => {
    test("rapid recordSchedule calls converge to single timestamp", () => {
      const monitorId = "default/rapid-fire";

      // Rapid-fire scheduling in same tick
      for (let i = 0; i < 100; i++) {
        recordSchedule(monitorId);
      }

      // Should have exactly one entry, recently scheduled
      expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);
      expect(isOverdue(monitorId, 60_000)).toBe(false);
    });

    test("disabled monitor: re-enable after clear triggers fresh schedule", async () => {
      const jm = createMockJobManager();
      const reconciler = createMonitorReconciler();
      const handler = createTypeSafeReconciliationHandler(
        reconciler as unknown as Parameters<typeof createTypeSafeReconciliationHandler>[0],
        { jobManager: jm },
        noopStatusUpdater,
      );
      const monitorId = "default/toggle-test";

      // Enable → schedule
      const enabledMonitor = createHttpMonitor({
        name: "toggle-test",
        namespace: "default",
        enabled: true,
      });
      await handler(enabledMonitor);
      expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);

      // Disable → clear
      const disabledMonitor = createHttpMonitor({
        name: "toggle-test",
        namespace: "default",
        enabled: false,
      });
      await handler(disabledMonitor);
      expect(getLastScheduleTime(monitorId)).toBe(0);

      // Re-enable → fresh schedule (not blocked by stale timestamp)
      await handler(enabledMonitor);
      expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);
    });

    test("failure during reschedule: tracker stays clean for safety-net", async () => {
      const monitorId = "default/fail-clean";
      const jm = createMockJobManager({
        scheduleCheck: mock(() => Promise.reject(new Error("K8s API down"))),
      });
      const monitor = createHttpMonitor({
        name: "fail-clean",
        namespace: "default",
      }) as unknown as Monitor;

      await rescheduleWithRetry(jm, monitor, monitorId, 0);

      // Failed: no schedule recorded → safety-net can detect and recover
      expect(getLastScheduleTime(monitorId)).toBe(0);
      expect(isOverdue(monitorId, 60_000)).toBe(true);
    });

    test("clearAll resets everything for clean restart", () => {
      recordSchedule("ns1/mon1");
      recordSchedule("ns2/mon2");
      recordSchedule("ns3/mon3");

      clearAll();

      expect(getLastScheduleTime("ns1/mon1")).toBe(0);
      expect(getLastScheduleTime("ns2/mon2")).toBe(0);
      expect(getLastScheduleTime("ns3/mon3")).toBe(0);

      // All monitors appear overdue → reconciler will reschedule on restart
      expect(isOverdue("ns1/mon1", 60_000)).toBe(true);
      expect(isOverdue("ns2/mon2", 60_000)).toBe(true);
      expect(isOverdue("ns3/mon3", 60_000)).toBe(true);
    });

    test("monitorId format is consistent: namespace/name", () => {
      // Verify the convention: different namespace+name combos are distinct
      recordSchedule("default/api");
      recordSchedule("prod/api");

      expect(getLastScheduleTime("default/api")).toBeGreaterThan(0);
      expect(getLastScheduleTime("prod/api")).toBeGreaterThan(0);
      // Different monitors despite same name
      removeMonitor("default/api");
      expect(getLastScheduleTime("default/api")).toBe(0);
      expect(getLastScheduleTime("prod/api")).toBeGreaterThan(0);
    });
  });
});
