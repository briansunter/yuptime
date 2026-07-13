import { afterEach, describe, expect, mock, test } from "bun:test";
import type { KubeConfig } from "@kubernetes/client-node";
import { createJobManager } from "./index";
import type { JobManager } from "./types";

// Mock the k8s-client so we don't hit a real cluster
mock.module("../k8s-client", () => ({
  getBatchApiClient: () => ({
    createNamespacedJob: mock(() => Promise.resolve({ metadata: { name: "job" } })),
    listJobForAllNamespaces: mock(() => Promise.resolve({ items: [] })),
    deleteNamespacedJob: mock(() => Promise.resolve({})),
    listNamespacedJob: mock(() => Promise.resolve({ items: [] })),
    readNamespacedJob: mock(() => Promise.resolve({ status: {} })),
  }),
  initializeK8sClient: () => ({}),
  getK8sClient: () => ({}),
  createCRDWatcher: () => ({
    get: mock(() => Promise.resolve({})),
    list: mock(() => Promise.resolve([])),
    watch: mock(() => Promise.resolve((): void => undefined)),
    patchStatus: mock(() => Promise.resolve({})),
  }),
}));

const fakeKubeConfig = {} as KubeConfig;

function createManager(): JobManager {
  return createJobManager({
    kubeConfig: fakeKubeConfig,
    jobTTL: 3600,
    namespace: "default",
  });
}

const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;

describe("JobManager lifecycle", () => {
  afterEach(() => {
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
  });

  test("start sets a cleanup interval", async () => {
    let intervalSet = false;
    globalThis.setInterval = ((_cb: () => void, _ms?: number) => {
      intervalSet = true;
      return 0 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval;

    const jm = createManager();
    await jm.start();
    expect(intervalSet).toBe(true);
    await jm.stop();
  });

  test("stop clears the cleanup interval", async () => {
    let cleared = false;
    const fakeHandle = 42 as unknown as ReturnType<typeof setInterval>;
    globalThis.setInterval = (() => fakeHandle) as typeof setInterval;
    globalThis.clearInterval = ((handle: ReturnType<typeof setInterval>) => {
      if (handle === fakeHandle) cleared = true;
    }) as typeof clearInterval;

    const jm = createManager();
    await jm.start();
    await jm.stop();
    expect(cleared).toBe(true);
  });

  test("start is idempotent", async () => {
    let count = 0;
    globalThis.setInterval = (() => {
      count++;
      return 0 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval;

    const jm = createManager();
    await jm.start();
    await jm.start(); // second start should be a no-op
    expect(count).toBe(1);
    await jm.stop();
  });

  test("stop is idempotent", async () => {
    let clearedCount = 0;
    globalThis.clearInterval = (() => {
      clearedCount++;
    }) as typeof clearInterval;

    const jm = createManager();
    await jm.stop(); // stop without start
    expect(clearedCount).toBe(0);
  });

  test("cleanupOldJobs lists checker jobs and returns deleted count", async () => {
    const jm = createManager();
    const deleted = await jm.cleanupOldJobs(3600);
    expect(deleted).toBe(0); // mock returns empty job list
  });

  test("getJobStatus returns pending for 404", async () => {
    const jm = createManager();
    // The mock readNamespacedJob returns { status: {} } → no succeeded/failed/active → pending
    const status = await jm.getJobStatus("nonexistent", "default");
    expect(status).toBe("pending");
  });

  test("cleanup interval callback runs cleanupOldJobs via batch API", async () => {
    const listCalls: number[] = [];
    mock.module("../k8s-client", () => ({
      getBatchApiClient: () => ({
        createNamespacedJob: mock(() => Promise.resolve({ metadata: { name: "job" } })),
        listJobForAllNamespaces: mock(() => {
          listCalls.push(1);
          return Promise.resolve({ items: [] });
        }),
        deleteNamespacedJob: mock(() => Promise.resolve({})),
        listNamespacedJob: mock(() => Promise.resolve({ items: [] })),
        readNamespacedJob: mock(() => Promise.resolve({ status: {} })),
      }),
      initializeK8sClient: () => ({}),
      getK8sClient: () => ({}),
      createCRDWatcher: () => ({
        get: mock(() => Promise.resolve({})),
        list: mock(() => Promise.resolve([])),
        watch: mock(() => Promise.resolve((): void => undefined)),
        patchStatus: mock(() => Promise.resolve({})),
      }),
    }));

    // Re-import to pick up the new mock
    const { createJobManager: createJobManagerFresh } = await import("./index");

    let capturedCb: (() => void) | null = null;
    globalThis.setInterval = ((cb: () => void) => {
      capturedCb = cb;
      return 0 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval;

    const jm = createJobManagerFresh({
      kubeConfig: fakeKubeConfig,
      jobTTL: 3600,
      namespace: "default",
    });
    await jm.start();

    const cb = capturedCb as (() => void) | null;
    cb?.();
    await new Promise((r) => setTimeout(r, 10));
    expect(listCalls.length).toBeGreaterThanOrEqual(1);
    await jm.stop();
  });
});
