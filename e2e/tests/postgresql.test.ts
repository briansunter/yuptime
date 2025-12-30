/**
 * PostgreSQL Monitor E2E Tests
 *
 * Note: These tests require a mock PostgreSQL server running.
 * The mock server is started by the E2E test infrastructure.
 */

import { afterEach, describe, test } from "bun:test";
import {
  assertCheckResult,
  createMonitor,
  type createPostgreSqlMonitor,
  deleteMonitor,
  E2E_NAMESPACE,
  postgresqlFixtures,
  uniqueTestName,
  waitForMonitorStatus,
} from "../lib";

describe("PostgreSQL Monitor E2E", () => {
  const createdMonitors: string[] = [];

  // Cleanup after each test
  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;
  });

  // Helper to create and track monitor
  async function createAndTrack(monitor: ReturnType<typeof createPostgreSqlMonitor>) {
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;
    createdMonitors.push(name);
    await createMonitor(monitor);
    return name;
  }

  test("returns UP for successful PostgreSQL connection", async () => {
    const name = await createAndTrack(postgresqlFixtures.success());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "POSTGRESQL_OK",
    });
  });

  test("returns DOWN for connection refused", async () => {
    const name = await createAndTrack(postgresqlFixtures.connectionRefused());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "down",
      reason: "CONNECTION_REFUSED",
    });
  });

  test("returns UP with custom database", async () => {
    const name = await createAndTrack(postgresqlFixtures.customDatabase());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "POSTGRESQL_OK",
    });
  });

  test("returns UP with SSL disabled", async () => {
    const name = await createAndTrack(postgresqlFixtures.sslDisabled());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "POSTGRESQL_OK",
    });
  });
});
