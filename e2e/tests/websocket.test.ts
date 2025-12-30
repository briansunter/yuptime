/**
 * WebSocket Monitor E2E Tests
 */

import { afterEach, describe, test } from "bun:test";
import {
  assertCheckResult,
  createMonitor,
  type createWebSocketMonitor,
  deleteMonitor,
  E2E_NAMESPACE,
  uniqueTestName,
  waitForMonitorStatus,
  wsFixtures,
} from "../lib";

describe("WebSocket Monitor E2E", () => {
  const createdMonitors: string[] = [];

  // Cleanup after each test
  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;
  });

  // Helper to create and track monitor
  async function createAndTrack(monitor: ReturnType<typeof createWebSocketMonitor>) {
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;
    createdMonitors.push(name);
    await createMonitor(monitor);
    return name;
  }

  test("returns UP for successful connection", async () => {
    const name = await createAndTrack(wsFixtures.success());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "WEBSOCKET_OK",
    });
  });

  test("returns UP for send/expect match", async () => {
    const name = await createAndTrack(wsFixtures.sendExpectMatch());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "WEBSOCKET_OK",
    });
  });

  test("returns DOWN for connection failed", async () => {
    const name = await createAndTrack(wsFixtures.connectionFailed());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "down",
      reason: "WEBSOCKET_ERROR",
    });
  });

  test("returns DOWN for timeout", async () => {
    const name = await createAndTrack(wsFixtures.timeout());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "down",
      reason: "WEBSOCKET_ERROR",
      messageContains: "timeout",
    });
  });
});
