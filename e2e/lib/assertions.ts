/**
 * Test Assertions for E2E Tests
 */

import { expect } from "bun:test";
import { getLocalHttpUrl } from "./config";
import type { MonitorStatus } from "./k8s-client";

/**
 * Assert that a monitor check result matches expected values
 */
export function assertCheckResult(
  status: MonitorStatus,
  expected: {
    state: "up" | "down";
    reason?: string;
    messageContains?: string;
  },
): void {
  expect(status.lastResult).toBeDefined();

  if (!status.lastResult) {
    throw new Error("No lastResult in status");
  }

  expect(status.lastResult.state).toBe(expected.state);

  if (expected.reason) {
    expect(status.lastResult.reason).toBe(expected.reason);
  }

  if (expected.messageContains) {
    expect(status.lastResult.message).toContain(expected.messageContains);
  }
}

/**
 * Assert that uptime percentages are within expected range
 */
export function assertUptime(
  status: MonitorStatus,
  expected: {
    min1h?: number;
    max1h?: number;
  },
): void {
  expect(status.uptime).toBeDefined();

  if (!status.uptime) {
    throw new Error("No uptime in status");
  }

  if (expected.min1h !== undefined) {
    expect(status.uptime.percent1h).toBeGreaterThanOrEqual(expected.min1h);
  }

  if (expected.max1h !== undefined) {
    expect(status.uptime.percent1h).toBeLessThanOrEqual(expected.max1h);
  }
}

/**
 * Assert that latency is within expected range
 */
export function assertLatency(
  status: MonitorStatus,
  expected: {
    minMs?: number;
    maxMs?: number;
  },
): void {
  expect(status.lastResult).toBeDefined();

  if (!status.lastResult) {
    throw new Error("No lastResult in status");
  }

  if (expected.minMs !== undefined) {
    expect(status.lastResult.latencyMs).toBeGreaterThanOrEqual(expected.minMs);
  }

  if (expected.maxMs !== undefined) {
    expect(status.lastResult.latencyMs).toBeLessThanOrEqual(expected.maxMs);
  }
}

/**
 * Get alerts from mock Alertmanager
 * Uses localhost since this runs from the test runner, not from K8s pods
 */
export async function getReceivedAlerts(): Promise<unknown[]> {
  const response = await fetch(getLocalHttpUrl("/alertmanager/alerts"));
  const data = (await response.json()) as { alerts: unknown[] };
  return data.alerts;
}

/**
 * Clear alerts in mock Alertmanager
 * Uses localhost since this runs from the test runner, not from K8s pods
 */
export async function clearReceivedAlerts(): Promise<void> {
  await fetch(getLocalHttpUrl("/alertmanager/alerts/clear"), { method: "POST" });
}

/**
 * Assert that an alert was received
 */
export async function assertAlertReceived(expected: {
  monitorName?: string;
  status?: "firing" | "resolved";
}): Promise<void> {
  const alerts = await getReceivedAlerts();

  expect(alerts.length).toBeGreaterThan(0);

  if (expected.monitorName) {
    const matchingAlert = alerts.find((alert) => {
      const a = alert as { labels?: { monitor?: string } };
      return a.labels?.monitor === expected.monitorName;
    });
    expect(matchingAlert).toBeDefined();
  }

  if (expected.status) {
    const matchingAlert = alerts.find((alert) => {
      const a = alert as { status?: string };
      return a.status === expected.status;
    });
    expect(matchingAlert).toBeDefined();
  }
}

/**
 * Assert that no alerts were received
 */
export async function assertNoAlertsReceived(): Promise<void> {
  const alerts = await getReceivedAlerts();
  expect(alerts.length).toBe(0);
}

/**
 * Generate a unique test name with random suffix
 * Keeps names short to stay under Kubernetes 63-char label limit
 * Job name format: monitor-{namespace}-{name}-{timestamp} (~35 chars overhead)
 * So monitor name should be <= 28 chars to be safe
 */
export function uniqueTestName(prefix: string): string {
  // Limit prefix to 20 chars to leave room for random suffix
  const shortPrefix = prefix.length > 20 ? prefix.substring(0, 20) : prefix;
  const random = Math.random().toString(36).substring(2, 8);
  return `${shortPrefix}-${random}`;
}
