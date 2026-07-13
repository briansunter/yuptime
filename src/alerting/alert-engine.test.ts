import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { alertDeliveryFailedTotal } from "../lib/prometheus";
import type { Monitor } from "../types/crd/monitor";
import { sendAlertToAlertmanager } from "./alert-engine";

interface FetchCall {
  url: string;
  init: RequestInit;
}

const fetchCalls: FetchCall[] = [];

const originalFetch = globalThis.fetch;

function createTestMonitor(alertmanagerUrl?: string): Monitor {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: { name: "test-monitor", namespace: "default" },
    spec: {
      enabled: true,
      type: "http",
      schedule: { intervalSeconds: 60, timeoutSeconds: 10 },
      target: { http: { url: "https://example.com" } },
      ...(alertmanagerUrl ? { alertmanagerUrl } : {}),
    },
  } as unknown as Monitor;
}

async function getFailureReasons(): Promise<Record<string, number>> {
  const result = await alertDeliveryFailedTotal.get();
  const reasons: Record<string, number> = {};
  for (const v of result.values) {
    const reason = v.labels?.reason;
    if (typeof reason === "string") {
      reasons[reason] = v.value;
    }
  }
  return reasons;
}

async function totalFailures(): Promise<number> {
  const result = await alertDeliveryFailedTotal.get();
  return result.values.reduce((sum, v) => sum + v.value, 0);
}

describe("sendAlertToAlertmanager", () => {
  beforeEach(() => {
    fetchCalls.length = 0;
    globalThis.fetch = mock((input: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init: init ?? {} });
      return Promise.resolve(new Response("", { status: 200 }));
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("skips alerting when no alertmanagerUrl configured", async () => {
    const monitor = createTestMonitor();
    await sendAlertToAlertmanager(monitor, "down");
    expect(fetchCalls).toHaveLength(0);
  });

  test("posts alert successfully for https URL", async () => {
    const monitor = createTestMonitor("https://alertmanager.example.com/api/v2/alerts");
    await sendAlertToAlertmanager(monitor, "down", "up");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.url).toBe("https://alertmanager.example.com/api/v2/alerts");
    expect(fetchCalls[0]?.init.method).toBe("POST");
  });

  test("increments failure counter on non-2xx response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("error", { status: 500 })),
    ) as unknown as typeof globalThis.fetch;
    const monitor = createTestMonitor("https://alertmanager.example.com/api/v2/alerts");

    await sendAlertToAlertmanager(monitor, "down");

    const reasons = await getFailureReasons();
    expect(reasons.status_500).toBeGreaterThanOrEqual(1);
  });

  test("increments failure counter on timeout", async () => {
    // Make the production AbortController timer fire immediately so the test
    // doesn't wait for the real 10s timeout.
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((cb: () => void) => {
      cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    globalThis.fetch = mock((_input, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal) {
          if (signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
          } else {
            signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }
        }
      });
    }) as unknown as typeof globalThis.fetch;

    const monitor = createTestMonitor("https://alertmanager.example.com/api/v2/alerts");

    try {
      await sendAlertToAlertmanager(monitor, "down");

      const reasons = await getFailureReasons();
      expect(reasons.timeout).toBeGreaterThanOrEqual(1);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
  });

  test("increments failure counter on network error", async () => {
    globalThis.fetch = mock(() => {
      return Promise.reject(new TypeError("fetch failed"));
    }) as unknown as typeof globalThis.fetch;

    const monitor = createTestMonitor("https://alertmanager.example.com/api/v2/alerts");

    await sendAlertToAlertmanager(monitor, "down");

    const reasons = await getFailureReasons();
    expect(reasons.network_error).toBeGreaterThanOrEqual(1);
  });

  test("increments failure counter on invalid scheme", async () => {
    const monitor = createTestMonitor("file:///etc/passwd");

    await sendAlertToAlertmanager(monitor, "down");

    expect(fetchCalls).toHaveLength(0);
    const reasons = await getFailureReasons();
    expect(reasons.invalid_scheme).toBeGreaterThanOrEqual(1);
  });

  test("increments failure counter on malformed URL", async () => {
    const monitor = createTestMonitor("not-a-url");

    await sendAlertToAlertmanager(monitor, "down");

    expect(fetchCalls).toHaveLength(0);
    const reasons = await getFailureReasons();
    expect(reasons.invalid_url).toBeGreaterThanOrEqual(1);
  });

  test("allows http scheme", async () => {
    const monitor = createTestMonitor("http://alertmanager.local/api/v2/alerts");
    await sendAlertToAlertmanager(monitor, "down");
    expect(fetchCalls).toHaveLength(1);
  });

  test("disables redirects", async () => {
    const monitor = createTestMonitor("https://alertmanager.example.com/api/v2/alerts");
    await sendAlertToAlertmanager(monitor, "down");
    expect(fetchCalls[0]?.init.redirect).toBe("error");
  });

  test("no failure counter increments on success", async () => {
    const before = await totalFailures();
    const monitor = createTestMonitor("https://alertmanager.example.com/api/v2/alerts");
    await sendAlertToAlertmanager(monitor, "down");
    const after = await totalFailures();
    expect(after).toBe(before);
  });
});
