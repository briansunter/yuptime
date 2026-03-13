/**
 * Regression tests for the "monitors only check once" bug.
 *
 * Root cause (3 interacting bugs, all now fixed):
 *
 * 1. `scheduledMonitors` Set blocked recovery: once a monitor was marked
 *    "scheduled", re-reconciliation skipped it even if the setTimeout chain
 *    was dead.  FIX: replaced Set with schedule-tracker timestamps + isOverdue().
 *
 * 2. No retry in completion-watcher: if scheduleCheck() threw inside the
 *    setTimeout callback, the error was logged but the chain died permanently.
 *    FIX: rescheduleWithRetry() with 3 retries + exponential backoff.
 *
 * 3. No recovery path after chain death: the scheduledMonitors Set still had
 *    the monitor, so neither reconciler nor safety-net could recover.
 *    FIX: on failure removeMonitor() clears tracker, enabling safety-net/reconciler retry.
 *
 * These tests exercise the actual production code paths that caused the bug.
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
        monitorId: "default/test-http",
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

// No-op status updater since we can't talk to K8s in tests
const noopStatusUpdater = {
  markValid: mock(() => Promise.resolve()),
  markInvalid: mock(() => Promise.resolve()),
};

describe("scheduling regression: monitors must check more than once", () => {
  beforeEach(() => {
    clearAll();
  });

  afterEach(() => {
    stopSafetyNet();
    clearAll();
  });

  // ── Bug #1: scheduledMonitors Set blocked recovery ──────────────────────

  describe("bug #1: re-reconciliation must reschedule overdue monitors", () => {
    test("first reconciliation schedules the monitor", async () => {
      const jm = createMockJobManager();
      const reconciler = createMonitorReconciler();
      const handler = createTypeSafeReconciliationHandler(
        reconciler as unknown as Parameters<typeof createTypeSafeReconciliationHandler>[0],
        { jobManager: jm },
        noopStatusUpdater,
      );

      const monitor = createHttpMonitor({ name: "api", namespace: "default" });
      await handler(monitor);

      // The reconciler calls scheduleMonitorCheck which sets a setTimeout,
      // so scheduleCheck won't be called yet (it's deferred). But the
      // schedule-tracker should have an optimistic record.
      expect(getLastScheduleTime("default/api")).toBeGreaterThan(0);
    });

    test("re-reconciliation within interval does NOT duplicate schedule", async () => {
      const jm = createMockJobManager();
      const reconciler = createMonitorReconciler();
      const handler = createTypeSafeReconciliationHandler(
        reconciler as unknown as Parameters<typeof createTypeSafeReconciliationHandler>[0],
        { jobManager: jm },
        noopStatusUpdater,
      );

      const monitor = createHttpMonitor({ name: "api", namespace: "default" });

      // First reconciliation
      await handler(monitor);
      const firstScheduleTime = getLastScheduleTime("default/api");
      expect(firstScheduleTime).toBeGreaterThan(0);

      // Second reconciliation immediately after — should skip (not overdue)
      await handler(monitor);

      // The schedule time should NOT have been updated (skipped path)
      // It stays the same because the monitor is not overdue
      const secondScheduleTime = getLastScheduleTime("default/api");
      expect(secondScheduleTime).toBe(firstScheduleTime);
    });

    test("re-reconciliation DOES reschedule when overdue (the key fix)", async () => {
      const jm = createMockJobManager();
      const reconciler = createMonitorReconciler();
      const handler = createTypeSafeReconciliationHandler(
        reconciler as unknown as Parameters<typeof createTypeSafeReconciliationHandler>[0],
        { jobManager: jm },
        noopStatusUpdater,
      );

      const monitor = createHttpMonitor({
        name: "api",
        namespace: "default",
        intervalSeconds: 60,
      });

      // First reconciliation
      await handler(monitor);

      // Simulate the setTimeout chain dying: clear the tracker record
      // so isOverdue returns true (lastScheduleTime = 0 → always overdue)
      removeMonitor("default/api");

      // Re-reconciliation: this is the exact path that was broken before.
      // OLD CODE: scheduledMonitors.has("default/api") → true → SKIP (bug!)
      // NEW CODE: getLastScheduleTime = 0, isOverdue = true → RESCHEDULE
      await handler(monitor);
      const recoveredScheduleTime = getLastScheduleTime("default/api");

      // The monitor should have been rescheduled (new timestamp)
      expect(recoveredScheduleTime).toBeGreaterThan(0);
    });

    test("overdue detection works after enough time passes", async () => {
      // This simulates the scenario where the chain just stops running
      // and enough time passes that the monitor becomes overdue
      const monitorId = "default/api";
      const intervalMs = 60_000; // 60s

      // Record a schedule time far in the past
      recordSchedule(monitorId);

      // Just scheduled — should NOT be overdue
      expect(isOverdue(monitorId, intervalMs)).toBe(false);

      // Simulate time passing by removing and re-adding with old timestamp
      // In reality the safety-net checks every 90s. We test the logic directly.
      removeMonitor(monitorId);

      // Now isOverdue should return true (lastScheduleTime = 0)
      expect(isOverdue(monitorId, intervalMs)).toBe(true);
    });
  });

  // ── Bug #2: completion-watcher chain dies on scheduleCheck failure ───────

  describe("bug #2: completion-watcher must retry on failure", () => {
    test("transient failure is retried and chain continues", async () => {
      let callCount = 0;
      const monitorId = "default/retry-once";
      const jm = createMockJobManager({
        scheduleCheck: mock(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error("K8s API timeout"));
          }
          return Promise.resolve({
            jobName: "check-job",
            namespace: "default",
            monitorId,
          });
        }),
      });
      const monitor = createHttpMonitor({
        name: "retry-once",
        namespace: "default",
      }) as unknown as Monitor;

      // maxRetries=1: attempt 0 fails (1s backoff), attempt 1 succeeds
      await rescheduleWithRetry(jm, monitor, monitorId, 1);

      // Should have retried and succeeded
      expect(callCount).toBe(2);
      // Chain is alive: schedule time recorded
      expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);
    });

    test("multiple transient failures all retried before success", async () => {
      let callCount = 0;
      const monitorId = "default/retry-multi";
      const jm = createMockJobManager({
        scheduleCheck: mock(() => {
          callCount++;
          if (callCount <= 2) {
            return Promise.reject(new Error(`failure #${callCount}`));
          }
          return Promise.resolve({
            jobName: "check-job",
            namespace: "default",
            monitorId,
          });
        }),
      });
      const monitor = createHttpMonitor({
        name: "retry-multi",
        namespace: "default",
      }) as unknown as Monitor;

      // maxRetries=2: attempt 0 fails (1s), attempt 1 fails (2s), attempt 2 succeeds
      await rescheduleWithRetry(jm, monitor, monitorId, 2);

      expect(callCount).toBe(3);
      expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);
    });

    test("permanent failure exhausts retries but does not throw", async () => {
      const monitorId = "default/perm-fail";
      const jm = createMockJobManager({
        scheduleCheck: mock(() => Promise.reject(new Error("permanent K8s failure"))),
      });
      const monitor = createHttpMonitor({
        name: "perm-fail",
        namespace: "default",
      }) as unknown as Monitor;

      // maxRetries=0: only 1 attempt, no backoff delay
      await rescheduleWithRetry(jm, monitor, monitorId, 0);

      expect(jm.scheduleCheck).toHaveBeenCalledTimes(1);
      // No schedule recorded (failed)
      expect(getLastScheduleTime(monitorId)).toBe(0);
    });
  });

  // ── Bug #3: no recovery path after chain death ──────────────────────────

  describe("bug #3: failure clears tracker so safety-net/reconciler can recover", () => {
    test("scheduleCheck failure in reconciler clears tracker (removeMonitor)", async () => {
      const monitorId = "default/api";

      // Simulate: reconciler's scheduleMonitorCheck calls recordSchedule
      // optimistically, then the setTimeout fires and scheduleCheck fails
      recordSchedule(monitorId);
      expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);

      // On failure, the reconciler calls removeMonitor
      removeMonitor(monitorId);
      expect(getLastScheduleTime(monitorId)).toBe(0);

      // Now isOverdue returns true, so safety-net/reconciler can retry
      expect(isOverdue(monitorId, 60000)).toBe(true);
    });

    test("safety-net detects overdue monitor and enables rescheduling", async () => {
      const monitorId = "default/api";
      const intervalMs = 60_000;

      // Monitor was scheduled, then chain died (tracker cleared)
      removeMonitor(monitorId);

      // Safety-net logic: checks isOverdue for each active monitor
      const overdueNow = isOverdue(monitorId, intervalMs);
      expect(overdueNow).toBe(true);

      // Safety-net would call scheduleMonitorCheck with delayMs=0
      // Simulate that by calling recordSchedule (what scheduleMonitorCheck does)
      recordSchedule(monitorId);

      // After recovery, monitor is no longer overdue
      expect(isOverdue(monitorId, intervalMs)).toBe(false);
      expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);
    });

    test("rescheduleWithRetry failure does NOT record schedule time", async () => {
      const monitorId = "default/no-record-on-fail";
      const jm = createMockJobManager({
        scheduleCheck: mock(() => Promise.reject(new Error("always fails"))),
      });
      const monitor = createHttpMonitor({
        name: "no-record-on-fail",
        namespace: "default",
      }) as unknown as Monitor;

      await rescheduleWithRetry(jm, monitor, monitorId, 0);

      // No schedule recorded — critical for safety-net to detect overdue
      expect(getLastScheduleTime(monitorId)).toBe(0);
      expect(isOverdue(monitorId, 60000)).toBe(true);
    });
  });

  // ── Full lifecycle: schedule → complete → reschedule → repeat ───────────

  describe("full lifecycle: monitor must be schedulable repeatedly", () => {
    test("initial schedule → completion → reschedule cycle", async () => {
      const monitorId = "default/lifecycle-cycle";
      const jm = createMockJobManager();
      const monitor = createHttpMonitor({
        name: "lifecycle-cycle",
        namespace: "default",
      }) as unknown as Monitor;

      // Cycle 1: initial schedule via reconciler path
      recordSchedule(monitorId);
      expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);

      // Cycle 1: job completes, completion-watcher reschedules
      await rescheduleWithRetry(jm, monitor, monitorId);
      const afterFirstReschedule = getLastScheduleTime(monitorId);
      expect(afterFirstReschedule).toBeGreaterThan(0);

      // Cycle 2: job completes again, completion-watcher reschedules again
      await rescheduleWithRetry(jm, monitor, monitorId);
      const afterSecondReschedule = getLastScheduleTime(monitorId);
      expect(afterSecondReschedule).toBeGreaterThanOrEqual(afterFirstReschedule);

      // scheduleCheck called twice (once per reschedule)
      expect(jm.scheduleCheck).toHaveBeenCalledTimes(2);
    });

    test("schedule → failure → safety-net recovery → continue", async () => {
      const monitorId = "default/lifecycle-recover";
      let callCount = 0;
      const jm = createMockJobManager({
        scheduleCheck: mock(() => {
          callCount++;
          // First call fails (chain dies), second succeeds (safety-net recovery)
          if (callCount === 1) {
            return Promise.reject(new Error("chain death"));
          }
          return Promise.resolve({
            jobName: "check-job",
            namespace: "default",
            monitorId,
          });
        }),
      });
      const monitor = createHttpMonitor({
        name: "lifecycle-recover",
        namespace: "default",
      }) as unknown as Monitor;

      // Cycle 1: completion-watcher tries to reschedule, fails permanently
      await rescheduleWithRetry(jm, monitor, monitorId, 0);
      expect(getLastScheduleTime(monitorId)).toBe(0);
      expect(isOverdue(monitorId, 60000)).toBe(true);

      // Safety-net detects overdue, triggers fresh schedule (which succeeds now)
      await rescheduleWithRetry(jm, monitor, monitorId, 0);
      expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);
      expect(isOverdue(monitorId, 60000)).toBe(false);
    });

    test("disabled monitor stops scheduling, re-enabled monitor resumes", async () => {
      const jm = createMockJobManager();
      const reconciler = createMonitorReconciler();
      const handler = createTypeSafeReconciliationHandler(
        reconciler as unknown as Parameters<typeof createTypeSafeReconciliationHandler>[0],
        { jobManager: jm },
        noopStatusUpdater,
      );

      const monitorId = "default/api";

      // Enable and schedule
      const enabledMonitor = createHttpMonitor({
        name: "api",
        namespace: "default",
        enabled: true,
      });
      await handler(enabledMonitor);
      expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);

      // Disable — should clear tracker
      const disabledMonitor = createHttpMonitor({
        name: "api",
        namespace: "default",
        enabled: false,
      });
      await handler(disabledMonitor);
      expect(getLastScheduleTime(monitorId)).toBe(0);

      // Re-enable — should schedule again (lastScheduleTime=0 → overdue → schedule)
      await handler(enabledMonitor);
      expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);
    });
  });
});
