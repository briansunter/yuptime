/**
 * Ping Monitor E2E Tests
 */

import { afterEach, describe, test } from "bun:test";
import {
  assertCheckResult,
  createMonitor,
  type createPingMonitor,
  deleteMonitor,
  E2E_NAMESPACE,
  pingFixtures,
  uniqueTestName,
  waitForMonitorStatus,
} from "../lib";

describe("Ping Monitor E2E", () => {
  const createdMonitors: string[] = [];

  // Cleanup after each test
  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;
  });

  // Helper to create and track monitor
  async function createAndTrack(monitor: ReturnType<typeof createPingMonitor>) {
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;
    createdMonitors.push(name);
    await createMonitor(monitor);
    return name;
  }

  test("returns UP for localhost", async () => {
    const name = await createAndTrack(pingFixtures.localhost());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "PING_OK",
    });
  });

  test(
    "returns DOWN for unreachable IP",
    async () => {
      const name = await createAndTrack(pingFixtures.unreachable());

      const status = await waitForMonitorStatus(name);

      // Unreachable IP can return different reasons depending on network environment:
      // - PING_UNREACHABLE: immediate "Network is unreachable" response
      // - TIMEOUT: no response until timeout (common in container environments)
      assertCheckResult(status, {
        state: "down",
        // reason can be PING_UNREACHABLE or TIMEOUT depending on network config
      });
    },
    { timeout: 30000 }, // 30 second test timeout - ping needs 3s + wait time
  );
});
