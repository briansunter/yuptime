/**
 * DNS Monitor E2E Tests
 */

import { afterEach, describe, test } from "bun:test";
import {
  assertCheckResult,
  type createDnsMonitor,
  createMonitor,
  deleteMonitor,
  dnsFixtures,
  E2E_NAMESPACE,
  uniqueTestName,
  waitForMonitorStatus,
} from "../lib";

describe("DNS Monitor E2E", () => {
  const createdMonitors: string[] = [];

  // Cleanup after each test
  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;
  });

  // Helper to create and track monitor
  async function createAndTrack(monitor: ReturnType<typeof createDnsMonitor>) {
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;
    createdMonitors.push(name);
    await createMonitor(monitor);
    return name;
  }

  test("returns UP for valid A record", async () => {
    const name = await createAndTrack(dnsFixtures.success());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "DNS_OK",
    });
  });

  test("returns DOWN for NXDOMAIN", async () => {
    const name = await createAndTrack(dnsFixtures.nxdomain());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "down",
      reason: "DNS_NXDOMAIN",
    });
  });
});
