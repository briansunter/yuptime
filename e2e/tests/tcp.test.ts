/**
 * TCP Monitor E2E Tests
 */

import { afterEach, describe, test } from "bun:test";
import {
  assertCheckResult,
  createMonitor,
  type createTcpMonitor,
  deleteMonitor,
  E2E_NAMESPACE,
  tcpFixtures,
  uniqueTestName,
  waitForMonitorStatus,
} from "../lib";

describe("TCP Monitor E2E", () => {
  const createdMonitors: string[] = [];

  // Cleanup after each test
  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;
  });

  // Helper to create and track monitor
  async function createAndTrack(monitor: ReturnType<typeof createTcpMonitor>) {
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;
    createdMonitors.push(name);
    await createMonitor(monitor);
    return name;
  }

  test("returns UP for successful connection", async () => {
    const name = await createAndTrack(tcpFixtures.success());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "TCP_OK",
    });
  });

  test("returns DOWN for connection refused", async () => {
    const name = await createAndTrack(tcpFixtures.connectionRefused());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "down",
      reason: "CONNECTION_REFUSED",
    });
  });

  test("returns UP for send/expect match", async () => {
    const name = await createAndTrack(tcpFixtures.sendExpectMatch());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "TCP_OK",
    });
  });

  test("returns UP for banner check", async () => {
    const name = await createAndTrack(tcpFixtures.bannerCheck());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "TCP_OK",
    });
  });

  test("returns DOWN for timeout", async () => {
    const name = await createAndTrack(tcpFixtures.timeout());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "down",
      reason: "TIMEOUT",
    });
  });
});
