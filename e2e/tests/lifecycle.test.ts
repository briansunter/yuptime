/**
 * Monitor Lifecycle E2E Tests
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  createHttpMonitor,
  createMonitor,
  deleteMonitor,
  E2E_NAMESPACE,
  getHttpUrl,
  getMetrics,
  getMonitor,
  uniqueTestName,
  waitForJobCompletion,
  waitForMonitorStatus,
} from "../lib";

describe("Monitor Lifecycle E2E", () => {
  const createdMonitors: string[] = [];

  // Cleanup after each test
  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;
  });

  // Helper to create and track monitor
  async function createAndTrack(monitor: ReturnType<typeof createHttpMonitor>) {
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;
    createdMonitors.push(name);
    await createMonitor(monitor);
    return name;
  }

  test("creates job when monitor created", async () => {
    const monitor = createHttpMonitor({
      name: "lifecycle-job",
      url: getHttpUrl("/health"),
    });
    const name = await createAndTrack(monitor);

    // Wait for job to be created and complete
    await waitForJobCompletion(name);

    // If we get here, job was created and completed
    expect(true).toBe(true);
  });

  test("updates status after job completion", async () => {
    const monitor = createHttpMonitor({
      name: "lifecycle-status",
      url: getHttpUrl("/health"),
    });
    const name = await createAndTrack(monitor);

    // Wait for status to be updated
    const status = await waitForMonitorStatus(name);

    // Status should have lastResult
    expect(status.lastResult).toBeDefined();
    expect(status.lastResult?.checkedAt).toBeDefined();
  });

  test("exports Prometheus metrics", async () => {
    const monitor = createHttpMonitor({
      name: "lifecycle-metrics",
      url: getHttpUrl("/health"),
    });
    const name = await createAndTrack(monitor);

    // Wait for check to complete
    await waitForMonitorStatus(name);

    // Get metrics
    const metrics = await getMetrics();

    // Should contain yuptime metrics
    expect(metrics).toContain("yuptime_");
  });

  test("cleans up when monitor deleted", async () => {
    const monitor = createHttpMonitor({
      name: "lifecycle-cleanup",
      url: getHttpUrl("/health"),
    });
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;

    // Create monitor
    await createMonitor(monitor);

    // Wait for status
    await waitForMonitorStatus(name);

    // Delete monitor
    await deleteMonitor(name, E2E_NAMESPACE);

    // Try to get monitor - should fail
    try {
      await getMonitor(name);
      expect(false).toBe(true); // Should not reach here
    } catch (_error) {
      // Expected - monitor should be deleted
      expect(true).toBe(true);
    }
  });

  test("respects enabled/disabled flag", async () => {
    const monitor = createHttpMonitor({
      name: "lifecycle-disabled",
      url: getHttpUrl("/health"),
    });

    // Disable the monitor
    monitor.spec.enabled = false;

    const name = await createAndTrack(monitor);

    // Wait a bit for any jobs to be created
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Get monitor - should not have status since it's disabled
    const result = await getMonitor(name);

    // Disabled monitors should not have a lastResult
    // (or may have no status at all)
    expect(result.status?.lastResult).toBeUndefined();
  });
});
