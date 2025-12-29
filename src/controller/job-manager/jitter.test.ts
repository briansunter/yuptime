import { describe, expect, test } from "bun:test";
import { calculateJitter, calculateNextRunTime, rescheduleJob } from "./jitter";

describe("calculateJitter", () => {
  test("returns 0 when jitterPercent is 0", () => {
    expect(calculateJitter("default", "test-monitor", 0, 60)).toBe(0);
  });

  test("returns a value within the jitter window", () => {
    const intervalSeconds = 60;
    const jitterPercent = 10;
    const maxJitterMs = (intervalSeconds * 1000 * jitterPercent) / 100; // 6000ms

    const jitter = calculateJitter("default", "test-monitor", jitterPercent, intervalSeconds);

    expect(jitter).toBeGreaterThanOrEqual(0);
    expect(jitter).toBeLessThan(maxJitterMs);
  });

  test("produces deterministic results for same input", () => {
    const namespace = "production";
    const name = "api-monitor";
    const jitterPercent = 20;
    const intervalSeconds = 30;

    const jitter1 = calculateJitter(namespace, name, jitterPercent, intervalSeconds);
    const jitter2 = calculateJitter(namespace, name, jitterPercent, intervalSeconds);
    const jitter3 = calculateJitter(namespace, name, jitterPercent, intervalSeconds);

    expect(jitter1).toBe(jitter2);
    expect(jitter2).toBe(jitter3);
  });

  test("produces different jitter for different monitors", () => {
    const jitterPercent = 20;
    const intervalSeconds = 60;

    const jitter1 = calculateJitter("default", "monitor-1", jitterPercent, intervalSeconds);
    const jitter2 = calculateJitter("default", "monitor-2", jitterPercent, intervalSeconds);
    const jitter3 = calculateJitter("default", "monitor-3", jitterPercent, intervalSeconds);

    // Very unlikely all three are the same
    const allSame = jitter1 === jitter2 && jitter2 === jitter3;
    expect(allSame).toBe(false);
  });

  test("different namespaces produce different jitter", () => {
    const jitterPercent = 20;
    const intervalSeconds = 60;

    const jitter1 = calculateJitter("prod", "api", jitterPercent, intervalSeconds);
    const jitter2 = calculateJitter("staging", "api", jitterPercent, intervalSeconds);

    expect(jitter1).not.toBe(jitter2);
  });

  test("scales with interval size", () => {
    const jitterPercent = 10;

    const jitter60s = calculateJitter("ns", "mon", jitterPercent, 60);
    const jitter300s = calculateJitter("ns", "mon", jitterPercent, 300);

    // Same seed, but max jitter window is 5x larger for 300s interval
    // The normalized value (0-1) is the same, but due to floor() rounding
    // we check that jitter300s is approximately 5x jitter60s
    const ratio = jitter300s / jitter60s;
    expect(ratio).toBeCloseTo(5, 0); // Within 5% tolerance
    expect(jitter300s).toBeGreaterThan(jitter60s);
  });

  test("handles edge cases", () => {
    // Very small interval
    expect(calculateJitter("ns", "mon", 10, 1)).toBeLessThan(100);

    // Very large interval
    const largeJitter = calculateJitter("ns", "mon", 10, 3600);
    expect(largeJitter).toBeGreaterThanOrEqual(0);
    expect(largeJitter).toBeLessThan(360000); // 10% of 1 hour in ms

    // 100% jitter (full interval)
    const fullJitter = calculateJitter("ns", "mon", 100, 60);
    expect(fullJitter).toBeLessThan(60000);
  });
});

describe("calculateNextRunTime", () => {
  test("returns time in the future", () => {
    const intervalSeconds = 60;
    const jitterMs = 1000;

    const before = new Date();
    const nextRun = calculateNextRunTime(intervalSeconds, jitterMs);
    const after = new Date();

    expect(nextRun.getTime()).toBeGreaterThan(before.getTime());
    expect(nextRun.getTime()).toBeGreaterThanOrEqual(before.getTime() + 60000 + 1000);
    expect(nextRun.getTime()).toBeLessThanOrEqual(after.getTime() + 60000 + 1000 + 100); // 100ms tolerance
  });

  test("adds interval and jitter to current time", () => {
    const intervalSeconds = 30;
    const jitterMs = 500;

    const nextRun = calculateNextRunTime(intervalSeconds, jitterMs);
    const now = new Date();

    const expectedMinTime = now.getTime() + 30000 + 500 - 100; // -100ms tolerance
    const expectedMaxTime = now.getTime() + 30000 + 500 + 100; // +100ms tolerance

    expect(nextRun.getTime()).toBeGreaterThanOrEqual(expectedMinTime);
    expect(nextRun.getTime()).toBeLessThanOrEqual(expectedMaxTime);
  });

  test("handles zero jitter", () => {
    const intervalSeconds = 60;
    const jitterMs = 0;

    const before = Date.now();
    const nextRun = calculateNextRunTime(intervalSeconds, jitterMs);

    expect(nextRun.getTime()).toBeGreaterThanOrEqual(before + 60000);
    expect(nextRun.getTime()).toBeLessThanOrEqual(before + 60000 + 100);
  });
});

describe("rescheduleJob", () => {
  test("schedules from current time, not scheduled time", () => {
    const currentTime = new Date();
    const intervalSeconds = 60;
    const jitterMs = 1000;

    const nextRun = rescheduleJob(currentTime, intervalSeconds, jitterMs);

    expect(nextRun.getTime()).toBe(currentTime.getTime() + 60000 + 1000);
  });

  test("prevents drift by using execution time as base", () => {
    // Simulate execution that took 5 seconds (started at scheduled time, finished 5s later)
    const executionCompletedAt = new Date();
    const intervalSeconds = 60;
    const jitterMs = 0;

    const nextRun = rescheduleJob(executionCompletedAt, intervalSeconds, jitterMs);

    // Next run should be interval from when execution completed, not from scheduled time
    expect(nextRun.getTime()).toBe(executionCompletedAt.getTime() + 60000);
  });

  test("handles past dates", () => {
    const pastTime = new Date("2020-01-01T00:00:00Z");
    const intervalSeconds = 60;
    const jitterMs = 500;

    const nextRun = rescheduleJob(pastTime, intervalSeconds, jitterMs);

    expect(nextRun.getTime()).toBe(pastTime.getTime() + 60500);
  });
});
