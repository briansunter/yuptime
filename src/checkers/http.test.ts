import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Monitor } from "../types/crd";

mock.module("../lib/secrets", () => ({
  resolveSecretCached: async (_namespace: string, _name: string, key: string) => `secret-${key}`,
  clearSecretCache: () => undefined,
  resolveSecret: async () => "",
  getSecretCacheStats: () => ({ size: 0, items: [] }),
}));

import { checkHttp, checkJsonQuery, checkKeyword } from "./http";

interface FetchCall {
  url: string;
  init: RequestInit & { tls?: { rejectUnauthorized?: boolean; serverName?: string; ca?: string } };
}

const fetchCalls: FetchCall[] = [];
let fetchHandler: (call: FetchCall) => Response | Promise<Response> = () =>
  new Response("", { status: 200 });

const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const call: FetchCall = { url, init: (init ?? {}) as FetchCall["init"] };
    fetchCalls.push(call);
    return Promise.resolve(fetchHandler(call));
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  fetchCalls.length = 0;
  fetchHandler = () => new Response("", { status: 200 });
});

afterEach(() => {
  delete process.env.YUPTIME_AUTH_BEARER_TOKEN;
});

function httpMonitor(http: Record<string, unknown>, extra?: Partial<Monitor["spec"]>): Monitor {
  return {
    apiVersion: "monitoring.yuptime.io/v1",
    kind: "Monitor",
    metadata: { name: "test", namespace: "default" },
    spec: {
      enabled: true,
      type: "http",
      schedule: { intervalSeconds: 60, timeoutSeconds: 10 },
      target: { http },
      ...extra,
    },
  } as unknown as Monitor;
}

describe("checkHttp", () => {
  test("returns up for 200 response", async () => {
    const result = await checkHttp(httpMonitor({ url: "https://127.0.0.1/health" }), 10);
    expect(result.state).toBe("up");
    expect(result.reason).toBe("HTTP_OK");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.init.method).toBe("GET");
  });

  test("returns down for unaccepted status code", async () => {
    fetchHandler = () => new Response("nope", { status: 500 });
    const result = await checkHttp(httpMonitor({ url: "https://127.0.0.1/x" }), 10);
    expect(result.state).toBe("down");
    expect(result.reason).toBe("HTTP_500");
  });

  test("acceptedStatusCodes overrides default 200", async () => {
    fetchHandler = () => new Response("", { status: 204 });
    const monitor = httpMonitor({ url: "https://127.0.0.1/" }, {
      successCriteria: { http: { acceptedStatusCodes: [204] } },
    } as Partial<Monitor["spec"]>);
    const result = await checkHttp(monitor, 10);
    expect(result.state).toBe("up");
  });
});

describe("checkHttp redirects", () => {
  test("303 rewrites POST → GET and drops body", async () => {
    let callIndex = 0;
    fetchHandler = () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response("", { status: 303, headers: { location: "https://127.0.0.1/done" } });
      }
      return new Response("", { status: 200 });
    };

    const result = await checkHttp(
      httpMonitor({
        url: "https://127.0.0.1/start",
        method: "POST",
        body: { type: "json", json: { ok: true } },
      }),
      10,
    );

    expect(result.state).toBe("up");
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]?.init.method).toBe("POST");
    expect(fetchCalls[0]?.init.body).toBeTruthy();
    expect(fetchCalls[1]?.init.method).toBe("GET");
    expect(fetchCalls[1]?.init.body).toBeUndefined();
  });

  test("301 rewrites POST → GET", async () => {
    let callIndex = 0;
    fetchHandler = () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response("", { status: 301, headers: { location: "https://127.0.0.1/done" } });
      }
      return new Response("", { status: 200 });
    };

    await checkHttp(
      httpMonitor({
        url: "https://127.0.0.1/start",
        method: "POST",
        body: { type: "text", text: "hello" },
      }),
      10,
    );

    expect(fetchCalls[1]?.init.method).toBe("GET");
    expect(fetchCalls[1]?.init.body).toBeUndefined();
  });

  test("307 preserves method and body", async () => {
    let callIndex = 0;
    fetchHandler = () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response("", { status: 307, headers: { location: "https://127.0.0.1/done" } });
      }
      return new Response("", { status: 200 });
    };

    await checkHttp(
      httpMonitor({
        url: "https://127.0.0.1/start",
        method: "POST",
        body: { type: "json", json: { keep: true } },
      }),
      10,
    );

    expect(fetchCalls[1]?.init.method).toBe("POST");
    expect(fetchCalls[1]?.init.body).toBe(JSON.stringify({ keep: true }));
  });

  test("returns down when redirect chain exceeds maxRedirects", async () => {
    fetchHandler = () =>
      new Response("", { status: 302, headers: { location: "https://127.0.0.1/loop" } });

    const result = await checkHttp(
      httpMonitor({ url: "https://127.0.0.1/start", maxRedirects: 2 }),
      10,
    );

    expect(result.state).toBe("down");
    expect(result.reason).toBe("REQUEST_ERROR");
    expect(result.message).toContain("Exceeded maximum redirects (2)");
    // initial + 2 redirects (third hop is blocked before fetch)
    expect(fetchCalls).toHaveLength(3);
  });

  test("followRedirects=false returns the 3xx as the final status", async () => {
    fetchHandler = () =>
      new Response("", { status: 302, headers: { location: "https://127.0.0.1/elsewhere" } });

    const monitor = httpMonitor({ url: "https://127.0.0.1/", followRedirects: false }, {
      successCriteria: { http: { acceptedStatusCodes: [302] } },
    } as Partial<Monitor["spec"]>);
    const result = await checkHttp(monitor, 10);

    expect(result.state).toBe("up");
    expect(fetchCalls).toHaveLength(1);
  });

  test("missing Location header on 3xx returns the response as-is", async () => {
    fetchHandler = () => new Response("", { status: 301 });

    const result = await checkHttp(httpMonitor({ url: "https://127.0.0.1/" }), 10);

    expect(result.state).toBe("down");
    expect(result.reason).toBe("HTTP_301");
    expect(fetchCalls).toHaveLength(1);
  });
});

describe("checkHttp errors", () => {
  test("AbortError → TIMEOUT", async () => {
    fetchHandler = () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    };

    const result = await checkHttp(httpMonitor({ url: "https://127.0.0.1/" }), 5);
    expect(result.state).toBe("down");
    expect(result.reason).toBe("TIMEOUT");
    expect(result.latencyMs).toBe(5000);
  });

  test("ECONNREFUSED → CONNECTION_REFUSED", async () => {
    fetchHandler = () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:443");
    };
    const result = await checkHttp(httpMonitor({ url: "https://127.0.0.1/" }), 10);
    expect(result.state).toBe("down");
    expect(result.reason).toBe("CONNECTION_REFUSED");
  });

  test("ENOTFOUND → DNS_NXDOMAIN", async () => {
    fetchHandler = () => {
      throw new Error("getaddrinfo ENOTFOUND nope.invalid");
    };
    const result = await checkHttp(httpMonitor({ url: "https://127.0.0.1/" }), 10);
    expect(result.state).toBe("down");
    expect(result.reason).toBe("DNS_NXDOMAIN");
  });

  test("certificate error → TLS_ERROR", async () => {
    fetchHandler = () => {
      throw new Error("self signed certificate in certificate chain");
    };
    const result = await checkHttp(httpMonitor({ url: "https://127.0.0.1/" }), 10);
    expect(result.state).toBe("down");
    expect(result.reason).toBe("TLS_ERROR");
  });
});

describe("checkHttp TLS options", () => {
  test("https URL passes serverName by default", async () => {
    await checkHttp(httpMonitor({ url: "https://127.0.0.1/" }), 10);
    expect(fetchCalls[0]?.init.tls?.serverName).toBe("127.0.0.1");
  });

  test("tls.verify=false sets rejectUnauthorized=false", async () => {
    await checkHttp(httpMonitor({ url: "https://127.0.0.1/", tls: { verify: false } }), 10);
    expect(fetchCalls[0]?.init.tls?.rejectUnauthorized).toBe(false);
  });

  test("tls.sni overrides serverName", async () => {
    await checkHttp(
      httpMonitor({ url: "https://127.0.0.1/", tls: { sni: "real.example.com" } }),
      10,
    );
    expect(fetchCalls[0]?.init.tls?.serverName).toBe("real.example.com");
  });

  test("plain http URL with no tls block omits tls options", async () => {
    await checkHttp(httpMonitor({ url: "http://127.0.0.1/" }), 10);
    expect(fetchCalls[0]?.init.tls).toBeUndefined();
  });

  test("caBundleSecretRef resolves CA via secret cache", async () => {
    await checkHttp(
      httpMonitor({
        url: "https://127.0.0.1/",
        tls: { caBundleSecretRef: { name: "ca", key: "ca.crt" } },
      }),
      10,
    );
    expect(fetchCalls[0]?.init.tls?.ca).toBe("secret-ca.crt");
  });
});

describe("checkKeyword body limits", () => {
  test("body within maxBodyBytes succeeds with keyword match", async () => {
    fetchHandler = () => new Response("hello world", { status: 200 });
    const monitor = httpMonitor({ url: "https://127.0.0.1/" }, {
      successCriteria: { keyword: { contains: ["hello"] } },
    } as Partial<Monitor["spec"]>);
    const result = await checkKeyword(monitor, 10);
    expect(result.state).toBe("up");
  });

  test("body exceeds maxBodyBytes returns BODY_TOO_LARGE", async () => {
    fetchHandler = () => new Response("x".repeat(1000), { status: 200 });
    const monitor = httpMonitor({ url: "https://127.0.0.1/", maxBodyBytes: 100 }, {
      successCriteria: { keyword: { contains: ["x"] } },
    } as Partial<Monitor["spec"]>);
    const result = await checkKeyword(monitor, 10);
    expect(result.state).toBe("down");
    expect(result.reason).toBe("BODY_TOO_LARGE");
  });

  test("missing required keyword fails", async () => {
    fetchHandler = () => new Response("hello world", { status: 200 });
    const monitor = httpMonitor({ url: "https://127.0.0.1/" }, {
      successCriteria: { keyword: { contains: ["goodbye"] } },
    } as Partial<Monitor["spec"]>);
    const result = await checkKeyword(monitor, 10);
    expect(result.state).toBe("down");
    expect(result.reason).toBe("KEYWORD_MISSING");
  });

  test("forbidden keyword present fails", async () => {
    fetchHandler = () => new Response("error: bad", { status: 200 });
    const monitor = httpMonitor({ url: "https://127.0.0.1/" }, {
      successCriteria: { keyword: { notContains: ["error"] } },
    } as Partial<Monitor["spec"]>);
    const result = await checkKeyword(monitor, 10);
    expect(result.state).toBe("down");
    expect(result.reason).toBe("KEYWORD_PRESENT");
  });
});

describe("checkJsonQuery", () => {
  test("matching JSON path passes", async () => {
    fetchHandler = () => new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    const monitor = httpMonitor({ url: "https://127.0.0.1/" }, {
      successCriteria: { jsonQuery: { path: "$.status", equals: "ok" } },
    } as Partial<Monitor["spec"]>);
    const result = await checkJsonQuery(monitor, 10);
    expect(result.state).toBe("up");
  });

  test("invalid JSON returns JSON_ERROR", async () => {
    fetchHandler = () => new Response("not json", { status: 200 });
    const monitor = httpMonitor({ url: "https://127.0.0.1/" }, {
      successCriteria: { jsonQuery: { path: "$.x" } },
    } as Partial<Monitor["spec"]>);
    const result = await checkJsonQuery(monitor, 10);
    expect(result.state).toBe("down");
    expect(result.reason).toBe("JSON_ERROR");
  });
});

describe("checkHttp success criteria", () => {
  test("latencyMsUnder rejects slow responses", async () => {
    fetchHandler = async () => {
      await new Promise((r) => setTimeout(r, 30));
      return new Response("", { status: 200 });
    };
    const monitor = httpMonitor({ url: "https://127.0.0.1/" }, {
      successCriteria: { http: { latencyMsUnder: 5 } },
    } as Partial<Monitor["spec"]>);
    const result = await checkHttp(monitor, 10);
    expect(result.state).toBe("down");
    expect(result.reason).toBe("LATENCY_EXCEEDED");
  });

  test("expectedContentType mismatch fails", async () => {
    fetchHandler = () =>
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    const result = await checkHttp(
      httpMonitor({
        url: "https://127.0.0.1/",
        expectedContentType: "application/json",
      }),
      10,
    );
    expect(result.state).toBe("down");
    expect(result.reason).toBe("INVALID_CONTENT_TYPE");
  });
});

describe("checkHttp auth", () => {
  test("bearer token without env returns AUTH_ERROR", async () => {
    delete process.env.YUPTIME_AUTH_BEARER_TOKEN;
    const result = await checkHttp(
      httpMonitor({
        url: "https://127.0.0.1/",
        auth: { bearer: { tokenSecretRef: { name: "x", key: "t" } } },
      }),
      10,
    );
    expect(result.state).toBe("down");
    expect(result.reason).toBe("AUTH_ERROR");
    expect(fetchCalls).toHaveLength(0);
  });

  test("bearer token from env attaches Authorization header", async () => {
    process.env.YUPTIME_AUTH_BEARER_TOKEN = "tkn-abc";
    await checkHttp(
      httpMonitor({
        url: "https://127.0.0.1/",
        auth: { bearer: { tokenSecretRef: { name: "x", key: "t" } } },
      }),
      10,
    );
    const headers = fetchCalls[0]?.init.headers as Headers | undefined;
    expect(headers?.get("Authorization")).toBe("Bearer tkn-abc");
  });
});
