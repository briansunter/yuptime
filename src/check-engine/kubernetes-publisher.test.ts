import { describe, expect, test } from "bun:test";
import { createHttpMonitor } from "../test-utils/fixtures/monitors";
import type { Monitor } from "../types/crd";
import type { PublishCandidate } from ".";
import { createKubernetesResultPublisher } from "./kubernetes-publisher";

function fixture(scheduledAt?: string): Monitor {
  return {
    ...createHttpMonitor({ jitterPercent: 0 }),
    metadata: {
      name: "publisher",
      namespace: "default",
      uid: "publisher-uid",
      generation: 2,
      resourceVersion: "17",
      creationTimestamp: "2026-01-01T00:00:00.000Z",
    },
    status: scheduledAt
      ? {
          lastResult: {
            state: "up",
            attempts: 1,
            checkedAt: scheduledAt,
            scheduledAt,
          },
        }
      : undefined,
  } as Monitor;
}

function candidate(monitor: Monitor, scheduledAt: string): PublishCandidate {
  return {
    monitor,
    nextRunAt: new Date(Date.parse(scheduledAt) + 60_000).toISOString(),
    result: {
      executionId: "execution",
      scheduledAt,
      startedAt: scheduledAt,
      checkedAt: scheduledAt,
      attempts: 1,
      state: "up",
      latencyMs: 1,
      reason: "OK",
      message: "ok",
    },
  };
}

describe("Kubernetes result publisher", () => {
  test("rejects a result older than the current committed slot", async () => {
    const current = fixture("2026-01-01T00:02:00.000Z");
    let patches = 0;
    const publisher = createKubernetesResultPublisher({
      get: () => Promise.resolve(current),
      patchStatus: () => {
        patches++;
        return Promise.resolve(current);
      },
    } as never);
    expect(await publisher.publish(candidate(current, "2026-01-01T00:01:00.000Z"))).toBe(false);
    expect(patches).toBe(0);
  });

  test("re-reads and retries a resourceVersion conflict", async () => {
    const current = fixture();
    const patches: unknown[] = [];
    let attempts = 0;
    const publisher = createKubernetesResultPublisher({
      get: () => Promise.resolve(current),
      patchStatus: (_name: string, patch: unknown) => {
        patches.push(patch);
        attempts++;
        if (attempts === 1) return Promise.reject({ code: 409 });
        return Promise.resolve(current);
      },
    } as never);
    expect(await publisher.publish(candidate(current, "2026-01-01T00:01:00.000Z"))).toBe(true);
    expect(attempts).toBe(2);
    expect(patches[1]).toMatchObject({ metadata: { resourceVersion: "17" } });
  });
});
