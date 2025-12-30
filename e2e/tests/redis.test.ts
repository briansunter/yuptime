/**
 * Redis Monitor E2E Tests
 *
 * Note: These tests require:
 * - A mock Redis server running
 * - Kubernetes secrets for credentials (if using auth)
 *
 * Skipped by default - enable when infrastructure is ready.
 */

import { afterEach, describe, test } from "bun:test";
import {
  assertCheckResult,
  createMonitor,
  type createRedisMonitor,
  deleteMonitor,
  E2E_NAMESPACE,
  redisFixtures,
  uniqueTestName,
  waitForMonitorStatus,
} from "../lib";

// Skip these tests until database mock infrastructure is set up
describe.skip("Redis Monitor E2E", () => {
  const createdMonitors: string[] = [];

  // Cleanup after each test
  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;
  });

  // Helper to create and track monitor
  async function createAndTrack(monitor: ReturnType<typeof createRedisMonitor>) {
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;
    createdMonitors.push(name);
    await createMonitor(monitor);
    return name;
  }

  test("returns UP for successful Redis connection", async () => {
    const name = await createAndTrack(redisFixtures.success());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "REDIS_OK",
    });
  });

  test("returns DOWN for connection refused", async () => {
    const name = await createAndTrack(redisFixtures.connectionRefused());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "down",
      reason: "CONNECTION_REFUSED",
    });
  });

  test("returns UP with authentication", async () => {
    const name = await createAndTrack(redisFixtures.withAuth());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "REDIS_OK",
    });
  });

  test("returns UP with custom database", async () => {
    const name = await createAndTrack(redisFixtures.customDatabase());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "REDIS_OK",
    });
  });
});
