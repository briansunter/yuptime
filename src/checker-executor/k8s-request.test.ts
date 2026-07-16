import { describe, expect, test } from "bun:test";
import {
  type FetchFunction,
  fetchK8sWithRetry,
  type RequestDependencies,
  type RetryPolicy,
} from "./k8s-request";

const policy: RetryPolicy = {
  maxAttempts: 4,
  initialDelayMs: 10,
  maxDelayMs: 25,
};

function dependencies(
  fetchImpl: FetchFunction,
  delays: number[],
  retries: string[],
): RequestDependencies {
  return {
    fetch: fetchImpl,
    sleep: (delayMs) => {
      delays.push(delayMs);
      return Promise.resolve();
    },
    onRetry: (_attempt, _delayMs, reason) => {
      retries.push(reason);
    },
  };
}

describe("fetchK8sWithRetry", () => {
  test("recovers when the Kubernetes API temporarily refuses connections", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const retries: string[] = [];
    const fetchImpl: FetchFunction = () => {
      attempts += 1;
      if (attempts < 3) {
        return Promise.reject(new TypeError("Unable to connect"));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    };

    const response = await fetchK8sWithRetry(
      "https://10.43.0.1/apis/monitoring.yuptime.io/v1/monitors/example",
      { method: "GET" },
      policy,
      dependencies(fetchImpl, delays, retries),
    );

    expect(response.status).toBe(200);
    expect(attempts).toBe(3);
    expect(delays).toEqual([10, 20]);
    expect(retries).toEqual(["Unable to connect", "Unable to connect"]);
  });

  test("retries transient API status responses", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const retries: string[] = [];
    const fetchImpl: FetchFunction = () => {
      attempts += 1;
      return Promise.resolve(new Response("{}", { status: attempts === 1 ? 503 : 200 }));
    };

    const response = await fetchK8sWithRetry(
      "https://10.43.0.1/apis/monitoring.yuptime.io/v1/monitors/example",
      { method: "GET" },
      policy,
      dependencies(fetchImpl, delays, retries),
    );

    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
    expect(delays).toEqual([10]);
    expect(retries).toEqual(["HTTP 503"]);
  });

  test("does not retry permanent client errors", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const retries: string[] = [];
    const fetchImpl: FetchFunction = () => {
      attempts += 1;
      return Promise.resolve(new Response("not found", { status: 404 }));
    };

    const response = await fetchK8sWithRetry(
      "https://10.43.0.1/apis/monitoring.yuptime.io/v1/monitors/missing",
      { method: "GET" },
      policy,
      dependencies(fetchImpl, delays, retries),
    );

    expect(response.status).toBe(404);
    expect(attempts).toBe(1);
    expect(delays).toEqual([]);
    expect(retries).toEqual([]);
  });

  test("returns the final transient response after exhausting attempts", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const retries: string[] = [];
    const fetchImpl: FetchFunction = () => {
      attempts += 1;
      return Promise.resolve(new Response("unavailable", { status: 503 }));
    };

    const response = await fetchK8sWithRetry(
      "https://10.43.0.1/apis/monitoring.yuptime.io/v1/monitors/example",
      { method: "PATCH" },
      policy,
      dependencies(fetchImpl, delays, retries),
    );

    expect(response.status).toBe(503);
    expect(attempts).toBe(4);
    expect(delays).toEqual([10, 20, 25]);
    expect(retries).toEqual(["HTTP 503", "HTTP 503", "HTTP 503"]);
  });
});
