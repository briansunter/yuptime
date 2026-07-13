import { afterEach, describe, expect, test } from "bun:test";
import {
  checkDuration,
  getMetrics,
  incrementActiveIncidents,
  monitorState,
  recordCheckResult,
  resetMonitorMetrics,
} from "./prometheus";

describe("prometheus metrics", () => {
  afterEach(() => {
    // Clean up test series so they don't leak across tests
    resetMonitorMetrics("metrics-test", "default");
    resetMonitorMetrics("metrics-test-2", "default");
  });

  test("monitor_state has no url label", async () => {
    monitorState.reset();
    recordCheckResult("metrics-test", "default", "http", {
      state: "up",
      latencyMs: 100,
    });

    const metrics = await getMetrics();
    const stateLine = metrics
      .split("\n")
      .find((l) => l.startsWith("yuptime_monitor_state") && !l.startsWith("#"));

    expect(stateLine).toBeDefined();
    // url must not appear as a label
    expect(stateLine).not.toContain("url=");
    expect(stateLine).toContain('monitor="metrics-test"');
    expect(stateLine).toContain('type="http"');
  });

  test("check_duration_seconds emits histogram buckets", async () => {
    recordCheckResult("metrics-test", "default", "http", {
      state: "up",
      durationMs: 250,
    });

    const metrics = await getMetrics();
    // Histograms export _bucket, _sum, and _count series
    expect(metrics).toContain("yuptime_monitor_check_duration_seconds_bucket");
    expect(metrics).toContain("yuptime_monitor_check_duration_seconds_sum");
    expect(metrics).toContain("yuptime_monitor_check_duration_seconds_count");
  });

  test("resetMonitorMetrics removes gauge and histogram series", async () => {
    recordCheckResult("metrics-test", "default", "http", {
      state: "up",
      latencyMs: 100,
      durationMs: 200,
    });

    // Confirm the series exists
    let metrics = await getMetrics();
    expect(metrics).toContain('monitor="metrics-test"');

    resetMonitorMetrics("metrics-test", "default");

    // The gauge and histogram series for this monitor should be gone
    metrics = await getMetrics();
    const monitorStateLines = metrics
      .split("\n")
      .filter((l) => l.startsWith("yuptime_monitor_state") && !l.startsWith("#"));
    const durationLines = metrics
      .split("\n")
      .filter((l) => l.startsWith("yuptime_monitor_check_duration_seconds") && !l.startsWith("#"));

    expect(monitorStateLines.every((l) => !l.includes('monitor="metrics-test"'))).toBe(true);
    expect(durationLines.every((l) => !l.includes('monitor="metrics-test"'))).toBe(true);
  });

  test("resetMonitorMetrics removes active incident series", async () => {
    incrementActiveIncidents("metrics-test", "default", "critical");

    let metrics = await getMetrics();
    expect(metrics).toContain('yuptime_active_incidents{monitor="metrics-test"');

    resetMonitorMetrics("metrics-test", "default");

    metrics = await getMetrics();
    const incidentLines = metrics
      .split("\\n")
      .filter((l) => l.startsWith("yuptime_active_incidents") && !l.startsWith("#"));
    expect(incidentLines.every((l) => !l.includes('monitor="metrics-test"'))).toBe(true);
  });

  test("resetMonitorMetrics preserves other monitors", async () => {
    recordCheckResult("metrics-test", "default", "http", {
      state: "up",
      latencyMs: 100,
    });
    recordCheckResult("metrics-test-2", "default", "http", {
      state: "down",
      latencyMs: 200,
    });

    resetMonitorMetrics("metrics-test", "default");

    const metrics = await getMetrics();
    const stateLines = metrics
      .split("\n")
      .filter((l) => l.startsWith("yuptime_monitor_state") && !l.startsWith("#"));

    // metrics-test-2 should still be present
    expect(stateLines.some((l) => l.includes('monitor="metrics-test-2"'))).toBe(true);
    // metrics-test should be gone
    expect(stateLines.every((l) => !l.includes('monitor="metrics-test"'))).toBe(true);
  });

  test("checkDuration is a histogram (has observe method)", () => {
    // Type-level check: histogram has observe, not set
    expect(typeof checkDuration.observe).toBe("function");
    expect(typeof (checkDuration as unknown as { set?: unknown }).set).toBe("undefined");
  });
});
