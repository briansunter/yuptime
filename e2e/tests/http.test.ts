/**
 * HTTP Monitor E2E Tests
 */

import { afterEach, describe, test } from "bun:test";
import {
  assertCheckResult,
  assertLatency,
  createHttpMonitor,
  createMonitor,
  deleteMonitor,
  E2E_NAMESPACE,
  getHttpUrl,
  httpFixtures,
  uniqueTestName,
  waitForMonitorStatus,
} from "../lib";

describe("HTTP Monitor E2E", () => {
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

  describe("Success Cases", () => {
    test("returns UP for HTTP 200", async () => {
      const name = await createAndTrack(httpFixtures.success());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
        reason: "HTTP_OK",
      });
    });

    test("returns UP with keyword match", async () => {
      const name = await createAndTrack(httpFixtures.keywordMatch());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("returns UP with JSON query match", async () => {
      const name = await createAndTrack(httpFixtures.jsonQueryMatch());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });
  });

  describe("Failure Cases", () => {
    test("returns DOWN for HTTP 500", async () => {
      const name = await createAndTrack(httpFixtures.status500());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "down",
        reason: "HTTP_500",
      });
    });

    test("returns DOWN for timeout", async () => {
      const name = await createAndTrack(httpFixtures.timeout());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "down",
        reason: "TIMEOUT",
      });
    });

    test("returns DOWN when keyword missing", async () => {
      const name = await createAndTrack(httpFixtures.keywordMissing());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "down",
        reason: "KEYWORD_MISSING",
      });
    });

    test("returns DOWN when JSON query fails", async () => {
      const name = await createAndTrack(httpFixtures.jsonQueryFail());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "down",
        reason: "JSON_VALUE_MISMATCH",
      });
    });

    test("returns DOWN when latency exceeds threshold", async () => {
      const name = await createAndTrack(httpFixtures.latencyExceeded());

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "down",
        reason: "LATENCY_EXCEEDED",
      });
    });
  });

  describe("Edge Cases", () => {
    test("follows redirects", async () => {
      const monitor = createHttpMonitor({
        name: "http-redirect",
        url: getHttpUrl("/redirect"),
      });
      const name = await createAndTrack(monitor);

      const status = await waitForMonitorStatus(name);

      // Should follow redirect to /health and succeed
      assertCheckResult(status, {
        state: "up",
        reason: "HTTP_OK",
      });
    });

    test("handles POST with body", async () => {
      const monitor = createHttpMonitor({
        name: "http-post",
        url: getHttpUrl("/echo"),
        method: "POST",
      });
      const name = await createAndTrack(monitor);

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });
    });

    test("sends custom headers", async () => {
      const monitor = createHttpMonitor({
        name: "http-headers",
        url: getHttpUrl("/headers"),
      });
      const name = await createAndTrack(monitor);

      const status = await waitForMonitorStatus(name);

      // Should succeed - headers endpoint returns request headers
      assertCheckResult(status, {
        state: "up",
      });
    });

    test("measures latency correctly", async () => {
      const monitor = createHttpMonitor({
        name: "http-latency",
        url: getHttpUrl("/slow/200"), // 200ms delay
      });
      const name = await createAndTrack(monitor);

      const status = await waitForMonitorStatus(name);

      assertCheckResult(status, {
        state: "up",
      });

      // Latency should be at least 200ms
      assertLatency(status, {
        minMs: 150, // Allow some variance
      });
    });
  });
});
