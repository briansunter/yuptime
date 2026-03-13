import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  clearAll,
  getAllTracked,
  getLastScheduleTime,
  isOverdue,
  recordSchedule,
  removeMonitor,
} from "./schedule-tracker";

describe("schedule-tracker", () => {
  beforeEach(() => {
    clearAll();
  });

  afterEach(() => {
    clearAll();
  });

  describe("recordSchedule", () => {
    test("stores current timestamp", () => {
      const before = Date.now();
      recordSchedule("default/test");
      const after = Date.now();

      const recorded = getLastScheduleTime("default/test");
      expect(recorded).toBeGreaterThanOrEqual(before);
      expect(recorded).toBeLessThanOrEqual(after);
    });

    test("overwrites previous value", () => {
      recordSchedule("default/test");
      const first = getLastScheduleTime("default/test");

      recordSchedule("default/test");
      const second = getLastScheduleTime("default/test");

      expect(second).toBeGreaterThanOrEqual(first);
    });
  });

  describe("getLastScheduleTime", () => {
    test("returns 0 for unknown monitors", () => {
      expect(getLastScheduleTime("unknown/monitor")).toBe(0);
    });

    test("returns recorded time for known monitors", () => {
      recordSchedule("default/test");
      expect(getLastScheduleTime("default/test")).toBeGreaterThan(0);
    });
  });

  describe("isOverdue", () => {
    test("returns true when never scheduled", () => {
      expect(isOverdue("unknown/monitor", 60000)).toBe(true);
    });

    test("returns true when elapsed > interval * multiplier", async () => {
      recordSchedule("default/test");
      // Wait a bit so elapsed time exceeds threshold
      await new Promise((r) => setTimeout(r, 10));
      // 1ms interval * 2 multiplier = 2ms threshold; ~10ms elapsed > 2ms
      expect(isOverdue("default/test", 1, 2)).toBe(true);
    });

    test("returns false when recently scheduled", () => {
      recordSchedule("default/test");
      // 60 second interval, default 2x multiplier = 120s threshold
      // Just recorded, so elapsed ~0ms < 120000ms
      expect(isOverdue("default/test", 60000)).toBe(false);
    });

    test("respects custom multiplier", async () => {
      recordSchedule("default/test");
      // With a very large multiplier, should not be overdue even with tiny interval
      expect(isOverdue("default/test", 1, 1000000)).toBe(false);
      // Wait so elapsed > 0
      await new Promise((r) => setTimeout(r, 10));
      // With multiplier 1 and 1ms interval, ~10ms elapsed > 1ms threshold
      expect(isOverdue("default/test", 1, 1)).toBe(true);
    });
  });

  describe("removeMonitor", () => {
    test("removes tracked monitor", () => {
      recordSchedule("default/test");
      expect(getLastScheduleTime("default/test")).toBeGreaterThan(0);

      removeMonitor("default/test");
      expect(getLastScheduleTime("default/test")).toBe(0);
    });

    test("no-op for unknown monitor", () => {
      removeMonitor("unknown/monitor"); // should not throw
    });
  });

  describe("getAllTracked", () => {
    test("returns all tracked monitors", () => {
      recordSchedule("ns1/mon1");
      recordSchedule("ns2/mon2");

      const tracked = getAllTracked();
      expect(tracked.size).toBe(2);
      expect(tracked.has("ns1/mon1")).toBe(true);
      expect(tracked.has("ns2/mon2")).toBe(true);
    });

    test("returns empty map initially", () => {
      expect(getAllTracked().size).toBe(0);
    });
  });

  describe("clearAll", () => {
    test("removes all tracked monitors", () => {
      recordSchedule("ns1/mon1");
      recordSchedule("ns2/mon2");
      expect(getAllTracked().size).toBe(2);

      clearAll();
      expect(getAllTracked().size).toBe(0);
      expect(getLastScheduleTime("ns1/mon1")).toBe(0);
    });
  });
});
