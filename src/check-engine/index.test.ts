import { describe, expect, test } from "bun:test";
import type { AttemptRequest, AttemptResult, CheckRunner } from "../check-runner/types";
import { createHttpMonitor } from "../test-utils/fixtures/monitors";
import type { Monitor } from "../types/crd";
import { createCheckEngine, type EngineClock, type PublishCandidate } from ".";

class FakeClock implements EngineClock {
  now: number;
  timers: Array<{ at: number; callback: () => void }> = [];

  constructor(now: number) {
    this.now = now;
  }

  wallNow = () => this.now;
  monotonicNow = () => this.now;
  setTimer = (callback: () => void, delayMs: number) => {
    const timer = { at: this.now + delayMs, callback };
    this.timers.push(timer);
    return timer;
  };
  clearTimer = (handle: unknown) => {
    this.timers = this.timers.filter((timer) => timer !== handle);
  };
  sleep = (delayMs: number) => {
    this.now += delayMs;
    return Promise.resolve();
  };

  advanceTo(now: number) {
    this.now = now;
    const due = this.timers.filter((timer) => timer.at <= now);
    this.timers = this.timers.filter((timer) => timer.at > now);
    for (const timer of due) timer.callback();
  }
}

function scheduledMonitor(now: number, status?: Monitor["status"], name = "engine"): Monitor {
  return {
    ...createHttpMonitor({ jitterPercent: 0 }),
    metadata: {
      name,
      namespace: "default",
      uid: `${name}-uid`,
      generation: 1,
      creationTimestamp: new Date(now).toISOString(),
    },
    status,
  } as Monitor;
}

function immediateRunner(results: AttemptRequest[] = []): CheckRunner {
  return {
    ready: () => Promise.resolve(true),
    shutdown: () => Promise.resolve(),
    runAttempt: (request): Promise<AttemptResult> => {
      results.push(request);
      return Promise.resolve({
        executionId: request.executionId,
        attempt: request.attempt,
        startedAt: new Date(Date.parse(request.scheduledAt) + 41).toISOString(),
        checkedAt: new Date(Date.parse(request.scheduledAt) + 5_000).toISOString(),
        state: "up",
        latencyMs: 5_000,
        reason: "OK",
        message: "ok",
      });
    },
  };
}

function capturePublisher(published: PublishCandidate[]) {
  return {
    publish(candidate: PublishCandidate) {
      published.push(candidate);
      return Promise.resolve(true);
    },
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Bun.sleep(0);
}

describe("Check Engine", () => {
  test("execution duration does not move the next slot", async () => {
    const origin = Date.parse("2026-01-01T00:00:00.000Z");
    const clock = new FakeClock(origin);
    const published: PublishCandidate[] = [];
    const engine = createCheckEngine({
      runner: immediateRunner(),
      publisher: capturePublisher(published),
      concurrency: 1,
      queueCapacity: 4,
      clock,
    });
    engine.upsert(scheduledMonitor(origin));
    await engine.start();
    await settle();
    expect(published).toHaveLength(1);
    expect(Date.parse(published[0]?.nextRunAt ?? "")).toBe(origin + 60_000);
    expect(Date.parse(published[0]?.result.checkedAt ?? "")).toBe(origin + 5_000);
  });

  test("restart coalesces missed slots to the latest and returns to phase", async () => {
    const origin = Date.parse("2026-01-01T00:00:00.000Z");
    const clock = new FakeClock(origin + 5 * 60_000 + 20_000);
    const attempts: AttemptRequest[] = [];
    const monitor = scheduledMonitor(origin, {
      lastResult: {
        state: "up",
        attempts: 1,
        checkedAt: new Date(origin + 60_000).toISOString(),
        scheduledAt: new Date(origin + 60_000).toISOString(),
      },
    });
    const engine = createCheckEngine({
      runner: immediateRunner(attempts),
      publisher: { publish: async () => true },
      concurrency: 1,
      queueCapacity: 4,
      clock,
    });
    engine.upsert(monitor);
    await engine.start();
    await settle();
    expect(attempts).toHaveLength(1);
    expect(Date.parse(attempts[0]?.scheduledAt ?? "")).toBe(origin + 5 * 60_000);
    expect(engine.snapshot().queueDepth).toBe(0);
  });

  test("generation change cancels stale publication", async () => {
    const origin = Date.parse("2026-01-01T00:00:00.000Z");
    const clock = new FakeClock(origin);
    let finish: ((result: AttemptResult) => void) | undefined;
    const published: PublishCandidate[] = [];
    const runner: CheckRunner = {
      ready: async () => true,
      shutdown: async () => undefined,
      runAttempt: (_request) =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    };
    const engine = createCheckEngine({
      runner,
      publisher: capturePublisher(published),
      concurrency: 1,
      queueCapacity: 2,
      clock,
    });
    const first = scheduledMonitor(origin);
    engine.upsert(first);
    await engine.start();
    await settle();
    engine.upsert({ ...first, metadata: { ...first.metadata, generation: 2 } });
    finish?.({
      executionId: "old",
      attempt: 1,
      startedAt: new Date(origin).toISOString(),
      checkedAt: new Date(origin + 1).toISOString(),
      state: "up",
      latencyMs: 1,
      reason: "OK",
      message: "ok",
    });
    await settle();
    expect(published).toHaveLength(0);
  });

  test("bounded admission preserves one run per monitor under saturation", async () => {
    const origin = Date.parse("2026-01-01T00:00:00.000Z");
    const clock = new FakeClock(origin);
    const resolvers: Array<(result: AttemptResult) => void> = [];
    const requests: AttemptRequest[] = [];
    const runner: CheckRunner = {
      ready: async () => true,
      shutdown: async () => undefined,
      runAttempt: (request) => {
        requests.push(request);
        return new Promise((resolve) => resolvers.push(resolve));
      },
    };
    const engine = createCheckEngine({
      runner,
      publisher: { publish: async () => true },
      concurrency: 1,
      queueCapacity: 1,
      clock,
    });
    for (const name of ["one", "two", "three"])
      engine.upsert(scheduledMonitor(origin, undefined, name));
    await engine.start();
    await settle();
    expect(engine.snapshot()).toMatchObject({ inFlight: 1, queueDepth: 1, overdueMonitors: 1 });
    expect(requests).toHaveLength(1);

    for (let index = 0; index < 3; index++) {
      const request = requests[index];
      resolvers[index]?.({
        executionId: request?.executionId ?? "missing",
        attempt: 1,
        startedAt: new Date(origin).toISOString(),
        checkedAt: new Date(origin + 1).toISOString(),
        state: "up",
        latencyMs: 1,
        reason: "OK",
        message: "ok",
      });
      await settle();
    }
    expect(requests).toHaveLength(3);
    expect(engine.snapshot()).toMatchObject({ inFlight: 0, queueDepth: 0, overdueMonitors: 0 });
  });

  test("a thousand-monitor burst stays within configured workers and queue", async () => {
    const origin = Date.parse("2026-01-01T00:00:00.000Z");
    const clock = new FakeClock(origin);
    let attempts = 0;
    const runner: CheckRunner = {
      ready: () => Promise.resolve(true),
      shutdown: () => Promise.resolve(),
      runAttempt: () => {
        attempts++;
        return new Promise(() => undefined);
      },
    };
    const engine = createCheckEngine({
      runner,
      publisher: { publish: () => Promise.resolve(true) },
      concurrency: 8,
      queueCapacity: 32,
      clock,
    });
    for (let index = 0; index < 1_000; index++) {
      engine.upsert(scheduledMonitor(origin, undefined, `scale-${index}`));
    }
    await engine.start();
    await settle();
    expect(attempts).toBe(8);
    expect(engine.snapshot()).toMatchObject({
      registeredMonitors: 1_000,
      inFlight: 8,
      queueDepth: 32,
      overdueMonitors: 960,
    });
  });

  test("deletion cancels an in-flight result before publication", async () => {
    const origin = Date.parse("2026-01-01T00:00:00.000Z");
    const clock = new FakeClock(origin);
    let finish: ((result: AttemptResult) => void) | undefined;
    const published: PublishCandidate[] = [];
    const runner: CheckRunner = {
      ready: async () => true,
      shutdown: async () => undefined,
      runAttempt: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    };
    const engine = createCheckEngine({
      runner,
      publisher: capturePublisher(published),
      concurrency: 1,
      queueCapacity: 1,
      clock,
    });
    engine.upsert(scheduledMonitor(origin));
    await engine.start();
    await settle();
    engine.remove("default/engine");
    finish?.({
      executionId: "deleted",
      attempt: 1,
      startedAt: new Date(origin).toISOString(),
      checkedAt: new Date(origin + 1).toISOString(),
      state: "up",
      latencyMs: 1,
      reason: "OK",
      message: "ok",
    });
    await settle();
    expect(published).toHaveLength(0);
  });
});
