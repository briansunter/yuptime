import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHttpMonitor } from "../../test-utils/fixtures/monitors";
import type { Monitor } from "../../types/crd/monitor";
import { rescheduleWithRetry } from "./completion-watcher";
import { clearAll, getLastScheduleTime } from "./schedule-tracker";
import type { JobManager } from "./types";

function createMockJobManager(overrides?: Partial<JobManager>): JobManager {
  return {
    scheduleCheck: mock(() =>
      Promise.resolve({ jobName: "test-job", namespace: "default", monitorId: "default/test" }),
    ),
    cancelJob: mock(() => Promise.resolve()),
    getJobStatus: mock(() => Promise.resolve("succeeded" as const)),
    cleanupOldJobs: mock(() => Promise.resolve(0)),
    start: mock(() => Promise.resolve()),
    stop: mock(() => Promise.resolve()),
    ...overrides,
  };
}

describe("rescheduleWithRetry", () => {
  beforeEach(() => {
    clearAll();
  });

  afterEach(() => {
    clearAll();
  });

  test("successful schedule records time and returns", async () => {
    const jm = createMockJobManager();
    const monitor = createHttpMonitor() as unknown as Monitor;
    const monitorId = "default/test-http";

    await rescheduleWithRetry(jm, monitor, monitorId);

    expect(jm.scheduleCheck).toHaveBeenCalledTimes(1);
    expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);
  });

  test("retries on failure with backoff", async () => {
    let callCount = 0;
    const jm = createMockJobManager({
      scheduleCheck: mock(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error("transient failure"));
        }
        return Promise.resolve({
          jobName: "test-job",
          namespace: "default",
          monitorId: "default/test",
        });
      }),
    });
    const monitor = createHttpMonitor() as unknown as Monitor;
    const monitorId = "default/test-http";

    // Use maxRetries=3, so attempts 0,1,2,3 — failure on 0,1, success on 2
    await rescheduleWithRetry(jm, monitor, monitorId, 3);

    expect(callCount).toBe(3);
    expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);
  });

  test("all retries exhausted logs error but does not throw", async () => {
    const jm = createMockJobManager({
      scheduleCheck: mock(() => Promise.reject(new Error("permanent failure"))),
    });
    const monitor = createHttpMonitor() as unknown as Monitor;
    const monitorId = "default/test-http";

    // Should not throw even when all retries fail
    // maxRetries=0 means only 1 attempt (attempt 0), no retries
    await rescheduleWithRetry(jm, monitor, monitorId, 0);

    expect(jm.scheduleCheck).toHaveBeenCalledTimes(1);
    // Schedule time should NOT be recorded on failure
    expect(getLastScheduleTime(monitorId)).toBe(0);
  });

  test("records schedule time only on success", async () => {
    let callCount = 0;
    const jm = createMockJobManager({
      scheduleCheck: mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("first attempt fails"));
        }
        return Promise.resolve({
          jobName: "test-job",
          namespace: "default",
          monitorId: "default/test",
        });
      }),
    });
    const monitor = createHttpMonitor() as unknown as Monitor;
    const monitorId = "default/test-http";

    // Before: no schedule time
    expect(getLastScheduleTime(monitorId)).toBe(0);

    await rescheduleWithRetry(jm, monitor, monitorId, 2);

    // After success: schedule time recorded
    expect(callCount).toBe(2);
    expect(getLastScheduleTime(monitorId)).toBeGreaterThan(0);
  });
});
