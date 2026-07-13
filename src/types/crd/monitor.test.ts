import { describe, expect, test } from "bun:test";
import { MonitorSchema } from "./monitor";

function createValidMonitorSpec() {
  return {
    type: "http" as const,
    schedule: { intervalSeconds: 30, timeoutSeconds: 10 },
    target: { http: { url: "https://example.com" } },
  };
}

function createMonitor(overrides: Record<string, unknown> = {}) {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: { name: "test", namespace: "default" },
    spec: { ...createValidMonitorSpec(), ...overrides },
  };
}

describe("MonitorScheduleSchema", () => {
  test("accepts intervalSeconds >= 20", () => {
    const result = MonitorSchema.safeParse(createMonitor());
    expect(result.success).toBe(true);
  });

  test("accepts intervalSeconds = 20 (boundary)", () => {
    const result = MonitorSchema.safeParse(
      createMonitor({
        schedule: { intervalSeconds: 20, timeoutSeconds: 10 },
      }),
    );
    expect(result.success).toBe(true);
  });

  test("rejects intervalSeconds < 20", () => {
    const result = MonitorSchema.safeParse(
      createMonitor({
        schedule: { intervalSeconds: 15, timeoutSeconds: 5 },
      }),
    );
    expect(result.success).toBe(false);
  });

  test("rejects intervalSeconds = 1", () => {
    const result = MonitorSchema.safeParse(
      createMonitor({
        schedule: { intervalSeconds: 1, timeoutSeconds: 1 },
      }),
    );
    expect(result.success).toBe(false);
  });

  test("rejects timeoutSeconds >= intervalSeconds", () => {
    const result = MonitorSchema.safeParse(
      createMonitor({
        schedule: { intervalSeconds: 30, timeoutSeconds: 30 },
      }),
    );
    expect(result.success).toBe(false);
  });

  test("rejects timeoutSeconds > intervalSeconds", () => {
    const result = MonitorSchema.safeParse(
      createMonitor({
        schedule: { intervalSeconds: 30, timeoutSeconds: 60 },
      }),
    );
    expect(result.success).toBe(false);
  });

  test("accepts timeoutSeconds = intervalSeconds - 1", () => {
    const result = MonitorSchema.safeParse(
      createMonitor({
        schedule: { intervalSeconds: 21, timeoutSeconds: 20 },
      }),
    );
    expect(result.success).toBe(true);
  });
});
