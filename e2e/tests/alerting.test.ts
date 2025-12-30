/**
 * Alerting E2E Tests
 *
 * Tests for maintenance windows and silences CRD operations.
 * Note: Full alerting integration requires NotificationPolicy and NotificationProvider
 * CRDs which are more complex to set up. These tests verify the basic CRD operations.
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  createHttpMonitor,
  createMaintenanceWindow,
  createMaintenanceWindowFixture,
  createMonitor,
  createSilence,
  createSilenceFixture,
  deleteMaintenanceWindow,
  deleteMonitor,
  deleteSilence,
  E2E_NAMESPACE,
  getHttpUrl,
  uniqueTestName,
  waitForMonitorStatus,
} from "../lib";

describe("Alerting E2E", () => {
  const createdMonitors: string[] = [];
  const createdMaintenanceWindows: string[] = [];
  const createdSilences: string[] = [];

  // Cleanup after each test
  afterEach(async () => {
    for (const name of createdMonitors) {
      await deleteMonitor(name, E2E_NAMESPACE);
    }
    createdMonitors.length = 0;

    for (const name of createdMaintenanceWindows) {
      await deleteMaintenanceWindow(name, E2E_NAMESPACE);
    }
    createdMaintenanceWindows.length = 0;

    for (const name of createdSilences) {
      await deleteSilence(name, E2E_NAMESPACE);
    }
    createdSilences.length = 0;
  });

  describe("Maintenance Windows", () => {
    test("can create active maintenance window", async () => {
      const mw = createMaintenanceWindowFixture({
        name: uniqueTestName("mw-active"),
        matchNamespaces: [E2E_NAMESPACE],
      });
      createdMaintenanceWindows.push(mw.metadata.name);

      const created = await createMaintenanceWindow(mw);

      expect(created.metadata.name).toBe(mw.metadata.name);
      expect(created.spec.durationMinutes).toBeGreaterThan(0);
      expect(created.spec.schedule).toBeDefined();
    });

    test("can create maintenance window with label selector", async () => {
      const mw = createMaintenanceWindowFixture({
        name: uniqueTestName("mw-label"),
        matchLabels: { "maintenance-group": "database" },
      });
      createdMaintenanceWindows.push(mw.metadata.name);

      const created = await createMaintenanceWindow(mw);

      expect(created.metadata.name).toBe(mw.metadata.name);
      expect(created.spec.selector?.matchLabels).toEqual({ "maintenance-group": "database" });
    });

    test("can create expired maintenance window", async () => {
      const mw = createMaintenanceWindowFixture({
        name: uniqueTestName("mw-expired"),
        matchNamespaces: [E2E_NAMESPACE],
        expired: true,
      });
      createdMaintenanceWindows.push(mw.metadata.name);

      const created = await createMaintenanceWindow(mw);

      expect(created.metadata.name).toBe(mw.metadata.name);
      // Expired window has shorter duration (30 min)
      expect(created.spec.durationMinutes).toBe(30);
    });

    test("monitors still run during maintenance window", async () => {
      // Create active maintenance window
      const mw = createMaintenanceWindowFixture({
        name: uniqueTestName("mw-test"),
        matchNamespaces: [E2E_NAMESPACE],
      });
      createdMaintenanceWindows.push(mw.metadata.name);
      await createMaintenanceWindow(mw);

      // Create a monitor and verify it runs
      const monitor = createHttpMonitor({
        name: uniqueTestName("mw-monitor"),
        url: getHttpUrl("/health"),
      });
      createdMonitors.push(monitor.metadata.name);
      await createMonitor(monitor);

      const status = await waitForMonitorStatus(monitor.metadata.name);

      // Monitor should still run and report status
      expect(status.lastResult).toBeDefined();
      expect(status.lastResult?.state).toBe("up");
    });
  });

  describe("Silences", () => {
    test("can create active silence", async () => {
      const silence = createSilenceFixture({
        name: uniqueTestName("silence"),
        matchNamespaces: [E2E_NAMESPACE],
      });
      createdSilences.push(silence.metadata.name);

      const created = await createSilence(silence);

      expect(created.metadata.name).toBe(silence.metadata.name);
      expect(created.spec.startsAt).toBeDefined();
      expect(created.spec.endsAt).toBeDefined();
    });

    test("can create silence with label selector", async () => {
      const silence = createSilenceFixture({
        name: uniqueTestName("silence-label"),
        matchLabels: { "silence-test": "true" },
      });
      createdSilences.push(silence.metadata.name);

      const created = await createSilence(silence);

      expect(created.metadata.name).toBe(silence.metadata.name);
      expect(created.spec.selector?.matchLabels).toEqual({ "silence-test": "true" });
    });

    test("can create expired silence", async () => {
      const silence = createSilenceFixture({
        name: uniqueTestName("silence-expired"),
        matchNamespaces: [E2E_NAMESPACE],
        expired: true,
      });
      createdSilences.push(silence.metadata.name);

      const created = await createSilence(silence);

      expect(created.metadata.name).toBe(silence.metadata.name);
      // Expired silence should have endsAt in the past
      const endsAt = new Date(created.spec.endsAt);
      expect(endsAt.getTime()).toBeLessThan(Date.now());
    });

    test("monitors still run during silence", async () => {
      // Create active silence
      const silence = createSilenceFixture({
        name: uniqueTestName("silence-test"),
        matchNamespaces: [E2E_NAMESPACE],
      });
      createdSilences.push(silence.metadata.name);
      await createSilence(silence);

      // Create a monitor and verify it runs
      const monitor = createHttpMonitor({
        name: uniqueTestName("silence-monitor"),
        url: getHttpUrl("/health"),
      });
      createdMonitors.push(monitor.metadata.name);
      await createMonitor(monitor);

      const status = await waitForMonitorStatus(monitor.metadata.name);

      // Monitor should still run and report status
      expect(status.lastResult).toBeDefined();
      expect(status.lastResult?.state).toBe("up");
    });
  });
});
