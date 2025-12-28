import { describe, expect, test } from "bun:test";
import {
  calculateDuration,
  calculateSLA,
  calculateUptime,
  classifyUptime,
  formatSLA,
  formatUptime,
} from "./uptime";

describe("calculateUptime", () => {
  test("returns 100% for empty heartbeats", () => {
    expect(calculateUptime([], 60)).toBe(100);
  });

  test("returns 100% for all up heartbeats", () => {
    const now = new Date();
    const heartbeats = [
      { state: "up" as const, checkedAt: new Date(now.getTime() - 1000) },
      { state: "up" as const, checkedAt: new Date(now.getTime() - 2000) },
      { state: "up" as const, checkedAt: new Date(now.getTime() - 3000) },
    ];
    expect(calculateUptime(heartbeats, 60)).toBe(100);
  });

  test("returns 0% for all down heartbeats", () => {
    const now = new Date();
    const heartbeats = [
      { state: "down" as const, checkedAt: new Date(now.getTime() - 1000) },
      { state: "down" as const, checkedAt: new Date(now.getTime() - 2000) },
    ];
    expect(calculateUptime(heartbeats, 60)).toBe(0);
  });

  test("calculates correct percentage for mixed states", () => {
    const now = new Date();
    const heartbeats = [
      { state: "up" as const, checkedAt: new Date(now.getTime() - 1000) },
      { state: "up" as const, checkedAt: new Date(now.getTime() - 2000) },
      { state: "down" as const, checkedAt: new Date(now.getTime() - 3000) },
      { state: "up" as const, checkedAt: new Date(now.getTime() - 4000) },
    ];
    expect(calculateUptime(heartbeats, 60)).toBe(75); // 3/4 = 75%
  });

  test("filters heartbeats outside the time window", () => {
    const now = new Date();
    const heartbeats = [
      { state: "up" as const, checkedAt: new Date(now.getTime() - 1000) }, // In window
      { state: "down" as const, checkedAt: new Date(now.getTime() - 120000) }, // Outside 1 min window
    ];
    expect(calculateUptime(heartbeats, 1)).toBe(100); // Only the 'up' is in window
  });

  test("returns 100% when no heartbeats in window", () => {
    const now = new Date();
    const heartbeats = [
      { state: "down" as const, checkedAt: new Date(now.getTime() - 120000) }, // 2 min ago
    ];
    expect(calculateUptime(heartbeats, 1)).toBe(100); // No heartbeats in 1 min window
  });

  test("handles string dates", () => {
    const now = new Date();
    const heartbeats = [
      {
        state: "up" as const,
        checkedAt: new Date(now.getTime() - 1000).toISOString(),
      },
      {
        state: "down" as const,
        checkedAt: new Date(now.getTime() - 2000).toISOString(),
      },
    ];
    expect(calculateUptime(heartbeats, 60)).toBe(50);
  });
});

describe("formatUptime", () => {
  test("formats to 2 decimal places", () => {
    expect(formatUptime(99.999)).toBe("100.00%");
    expect(formatUptime(99.12345)).toBe("99.12%");
    expect(formatUptime(0)).toBe("0.00%");
  });
});

describe("calculateDuration", () => {
  test("calculates duration in seconds", () => {
    const start = new Date("2024-01-01T00:00:00Z");
    const end = new Date("2024-01-01T00:01:00Z");
    expect(calculateDuration(start, end)).toBe(60);
  });

  test("uses current time when endedAt is undefined", () => {
    const fiveSecondsAgo = new Date(Date.now() - 5000);
    const duration = calculateDuration(fiveSecondsAgo);
    expect(duration).toBeGreaterThanOrEqual(5);
    expect(duration).toBeLessThan(10);
  });
});

describe("calculateSLA", () => {
  test("returns 100% for no incidents", () => {
    const windowMs = 60 * 60 * 1000; // 1 hour
    expect(calculateSLA([], windowMs)).toBe(100);
  });

  test("calculates downtime correctly", () => {
    const now = new Date();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const incidents = [
      {
        startedAt: new Date(now.getTime() - 30 * 60 * 1000), // 30 min ago
        endedAt: new Date(now.getTime() - 20 * 60 * 1000), // 20 min ago (10 min incident)
      },
    ];
    // 10 minutes downtime in 60 minutes = ~83.33% uptime
    const sla = calculateSLA(incidents, windowMs);
    expect(sla).toBeCloseTo(83.33, 1);
  });

  test("handles ongoing incidents", () => {
    const now = new Date();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const incidents = [
      {
        startedAt: new Date(now.getTime() - 30 * 60 * 1000), // 30 min ago, ongoing
      },
    ];
    // 30 minutes downtime in 60 minutes = 50% uptime
    const sla = calculateSLA(incidents, windowMs);
    expect(sla).toBe(50);
  });

  test("clamps result between 0 and 100", () => {
    expect(calculateSLA([], 1000)).toBeLessThanOrEqual(100);
    expect(calculateSLA([], 1000)).toBeGreaterThanOrEqual(0);
  });
});

describe("classifyUptime", () => {
  test("classifies excellent (>= 99.9%)", () => {
    expect(classifyUptime(99.9)).toBe("excellent");
    expect(classifyUptime(100)).toBe("excellent");
  });

  test("classifies good (>= 99%)", () => {
    expect(classifyUptime(99)).toBe("good");
    expect(classifyUptime(99.5)).toBe("good");
  });

  test("classifies fair (>= 95%)", () => {
    expect(classifyUptime(95)).toBe("fair");
    expect(classifyUptime(98)).toBe("fair");
  });

  test("classifies poor (>= 90%)", () => {
    expect(classifyUptime(90)).toBe("poor");
    expect(classifyUptime(94)).toBe("poor");
  });

  test("classifies critical (< 90%)", () => {
    expect(classifyUptime(89)).toBe("critical");
    expect(classifyUptime(0)).toBe("critical");
  });
});

describe("formatSLA", () => {
  test("formats SLA with nines notation", () => {
    const formatted = formatSLA(99);
    expect(formatted).toContain("99.00%");
    expect(formatted).toMatch(/\d+\.\d+N/);
  });
});
