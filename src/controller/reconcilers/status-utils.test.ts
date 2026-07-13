import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Condition } from "../../types/crd";

/**
 * Capture the patchStatus calls issued by status-utils.
 * createCRDWatcher is module-level imported, so we mock ../k8s-client.
 */

const patchCalls: Array<{
  name: string;
  body: unknown;
  namespace: string | undefined;
}> = [];

let storedResource: Record<string, unknown> = {};

const watcherMock = {
  get: mock((_name: string, _namespace?: string) =>
    Promise.resolve(structuredClone(storedResource)),
  ),
  patchStatus: mock((name: string, body: unknown, ns?: string) => {
    patchCalls.push({ name, body, namespace: ns });
    return Promise.resolve({});
  }),
  list: mock(() => Promise.resolve([])),
  watch: mock(() => Promise.resolve((): void => undefined)),
};

mock.module("../k8s-client", () => ({
  createCRDWatcher: () => watcherMock,
  initializeK8sClient: () => ({}),
  getK8sClient: () => ({}),
}));

import { markInvalid, markValid } from "./status-utils";

function reset() {
  patchCalls.length = 0;
  watcherMock.get.mockClear();
  watcherMock.patchStatus.mockClear();
  storedResource = {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: { name: "test-monitor", namespace: "default", generation: 3 },
  };
}

describe("status-utils — targeted status patching", () => {
  beforeEach(reset);
  afterEach(() => {
    storedResource = {};
  });

  test("markValid preserves an existing lastResult", async () => {
    const lastResult = {
      state: "up",
      checkedAt: "2026-01-01T00:00:00Z",
      latencyMs: 42,
      attempts: 1,
    };
    storedResource = {
      ...storedResource,
      status: {
        lastResult,
        previousResult: { ...lastResult, state: "down" },
      },
    };

    await markValid("Monitor", "monitors", "default", "test-monitor", 3);

    expect(patchCalls).toHaveLength(1);
    const body = patchCalls[0]?.body as Array<{ op: string; path: string; value: unknown }>;

    // Patch must not reference or copy lastResult/previousResult
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("lastResult");
    expect(serialized).not.toContain("previousResult");

    // Only /status/conditions and /status/observedGeneration are touched
    const paths = body.map((op) => op.path);
    expect(paths).toContain("/status/conditions");
    expect(paths).toContain("/status/observedGeneration");
    expect(
      paths.every((p) => p === "/status/conditions" || p === "/status/observedGeneration"),
    ).toBe(true);
  });

  test("markInvalid preserves check results", async () => {
    const lastResult = {
      state: "down",
      checkedAt: "2026-01-01T00:00:00Z",
      attempts: 1,
    };
    storedResource = {
      ...storedResource,
      status: { lastResult },
    };

    await markInvalid("Monitor", "monitors", "default", "test-monitor", "Bad", "no good");

    expect(patchCalls).toHaveLength(1);
    const body = patchCalls[0]?.body as Array<{ op: string; path: string; value: unknown }>;
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("lastResult");

    const paths = body.map((op) => op.path);
    expect(paths).toEqual(["/status/conditions"]);
  });

  test("missing conditions are created via add operation", async () => {
    storedResource = {
      ...storedResource,
      status: { lastResult: undefined },
    };

    await markValid("Monitor", "monitors", "default", "test-monitor", 1);

    const body = patchCalls[0]?.body as Array<{ op: string; path: string; value: unknown }>;
    expect(body.every((op) => op.op === "add")).toBe(true);

    const conditionsOp = body.find((op) => op.path === "/status/conditions");
    expect(conditionsOp).toBeDefined();
    const conditions = conditionsOp?.value as Condition[];
    const types = conditions.map((c) => c.type);
    expect(types).toEqual(expect.arrayContaining(["Valid", "Reconciled", "Ready"]));
  });

  test("creates status document when absent", async () => {
    // No status field at all
    await markValid("Monitor", "monitors", "default", "test-monitor", 2);

    const body = patchCalls[0]?.body as Array<{ op: string; path: string; value: unknown }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.op).toBe("add");
    expect(body[0]?.path).toBe("/status");

    const statusValue = body[0]?.value as Record<string, unknown>;
    expect(statusValue.conditions).toBeDefined();
    expect(statusValue.observedGeneration).toBe(2);
    // No check-result fields seeded
    expect(statusValue.lastResult).toBeUndefined();
  });

  test("existing condition transition timestamps remain correct", async () => {
    const existingTransition = "2025-01-01T00:00:00Z";
    storedResource = {
      ...storedResource,
      status: {
        conditions: [
          {
            type: "Valid",
            status: "False",
            reason: "Old",
            message: "previously invalid",
            lastTransitionTime: existingTransition,
          },
        ],
      },
    };

    await markValid("Monitor", "monitors", "default", "test-monitor", 1);

    const body = patchCalls[0]?.body as Array<{ op: string; path: string; value: unknown }>;
    const conditionsOp = body.find((op) => op.path === "/status/conditions");
    const conditions = conditionsOp?.value as Condition[];
    const valid = conditions.find((c) => c.type === "Valid");
    expect(valid).toBeDefined();
    // Status changed False→True, so transition time must advance
    expect(valid?.status).toBe("True");
    expect(valid?.lastTransitionTime).not.toBe(existingTransition);
  });

  test("unchanged condition retains prior transition timestamp", async () => {
    const existingTransition = "2025-06-01T12:00:00Z";
    storedResource = {
      ...storedResource,
      status: {
        conditions: [
          {
            type: "Ready",
            status: "True",
            reason: "ResourceReady",
            message: "Resource is ready",
            lastTransitionTime: existingTransition,
          },
        ],
      },
    };

    await markValid("Monitor", "monitors", "default", "test-monitor", 1);

    const body = patchCalls[0]?.body as Array<{ op: string; path: string; value: unknown }>;
    const conditionsOp = body.find((op) => op.path === "/status/conditions");
    const conditions = conditionsOp?.value as Condition[];
    const ready = conditions.find((c) => c.type === "Ready");
    // Status stayed True → timestamp preserved
    expect(ready?.lastTransitionTime).toBe(existingTransition);
  });

  test("patch uses add operations only (no replace /status)", async () => {
    storedResource = {
      ...storedResource,
      status: { lastResult: { state: "up", checkedAt: "x", attempts: 1 } },
    };

    await markValid("Monitor", "monitors", "default", "test-monitor", 5);

    const body = patchCalls[0]?.body as Array<{ op: string; path: string }>;
    expect(body.every((op) => op.op === "add")).toBe(true);
    expect(body.some((op) => op.path === "/status")).toBe(false);
  });
});
