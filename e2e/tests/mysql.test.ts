/**
 * MySQL Monitor E2E Tests
 *
 * Note: These tests require:
 * - A mock MySQL server running
 * - Kubernetes secrets for credentials
 *
 * Skipped by default - enable when infrastructure is ready.
 */

import { afterEach, describe, test } from "bun:test";
import {
  assertCheckResult,
  createMonitor,
  type createMySqlMonitor,
  deleteMonitor,
  E2E_NAMESPACE,
  mysqlFixtures,
  uniqueTestName,
  waitForMonitorStatus,
} from "../lib";

// Database E2E tests are slow (each waits for K8s job completion)
// Skip in CI to avoid timeout, run manually for integration testing
describe.skip("MySQL Monitor E2E", () => {
  const createdMonitors: string[] = [];

  // Cleanup after each test
  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;
  });

  // Helper to create and track monitor
  async function createAndTrack(monitor: ReturnType<typeof createMySqlMonitor>) {
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;
    createdMonitors.push(name);
    await createMonitor(monitor);
    return name;
  }

  test("returns UP for successful MySQL connection", async () => {
    const name = await createAndTrack(mysqlFixtures.success());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "MYSQL_OK",
    });
  });

  test("returns DOWN for connection refused", async () => {
    const name = await createAndTrack(mysqlFixtures.connectionRefused());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "down",
      reason: "CONNECTION_REFUSED",
    });
  });

  test("returns UP with custom database", async () => {
    const name = await createAndTrack(mysqlFixtures.customDatabase());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "MYSQL_OK",
    });
  });

  test("returns UP with custom health query", async () => {
    const name = await createAndTrack(mysqlFixtures.customQuery());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "MYSQL_OK",
    });
  });
});
