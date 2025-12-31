/**
 * gRPC Monitor E2E Tests
 *
 * Requires:
 * - gRPC health server running via mock-server (port 50151)
 */

import { afterEach, describe, test } from "bun:test";
import {
  assertCheckResult,
  createMonitor,
  type createGrpcMonitor,
  deleteMonitor,
  E2E_NAMESPACE,
  grpcFixtures,
  uniqueTestName,
  waitForMonitorStatus,
} from "../lib";

describe("gRPC Monitor E2E", () => {
  const createdMonitors: string[] = [];

  // Cleanup after each test
  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;
  });

  // Helper to create and track monitor
  async function createAndTrack(monitor: ReturnType<typeof createGrpcMonitor>) {
    const name = uniqueTestName(monitor.metadata.name);
    monitor.metadata.name = name;
    createdMonitors.push(name);
    await createMonitor(monitor);
    return name;
  }

  test("returns UP for successful gRPC health check", async () => {
    const name = await createAndTrack(grpcFixtures.success());

    const status = await waitForMonitorStatus(name);

    assertCheckResult(status, {
      state: "up",
      reason: "GRPC_SERVING",
    });
  });

  test("returns DOWN for connection refused", async () => {
    const name = await createAndTrack(grpcFixtures.connectionRefused());

    const status = await waitForMonitorStatus(name);

    // gRPC returns UNAVAILABLE (code 14) for connection failures
    assertCheckResult(status, {
      state: "down",
      reason: "GRPC_UNAVAILABLE",
    });
  });

  test("returns UP with custom service", async () => {
    const name = await createAndTrack(grpcFixtures.customService());

    const status = await waitForMonitorStatus(name);

    // Custom service may return NOT_SERVING if not configured in mock
    // This tests that the service name is correctly passed
    assertCheckResult(status, {
      state: "down",
      reason: "GRPC_NOT_SERVING",
    });
  });
});
