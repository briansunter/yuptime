import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fetchOAuth2Token } from "./oauth";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.YUPTIME_AUTH_OAUTH_CLIENT_ID = "client-id";
  process.env.YUPTIME_AUTH_OAUTH_CLIENT_SECRET = "client-secret";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.YUPTIME_AUTH_OAUTH_CLIENT_ID;
  delete process.env.YUPTIME_AUTH_OAUTH_CLIENT_SECRET;
});

describe("fetchOAuth2Token", () => {
  test("rejects malformed token URLs before making a request", async () => {
    await expect(fetchOAuth2Token({ tokenUrl: "not-a-url" }, 5)).rejects.toThrow(
      "OAuth2 token URL must be a valid URL",
    );
  });

  test("rejects unsupported token URL protocols", async () => {
    await expect(fetchOAuth2Token({ tokenUrl: "ftp://example.com/token" }, 5)).rejects.toThrow(
      "OAuth2 token URL must use http or https",
    );
  });

  test("disables redirects for token delivery", async () => {
    let requestInit: RequestInit | undefined;
    globalThis.fetch = ((_input, init) => {
      requestInit = init;
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: "token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof fetch;

    await expect(fetchOAuth2Token({ tokenUrl: "https://example.com/token" }, 5)).resolves.toBe(
      "token",
    );
    expect(requestInit?.redirect).toBe("error");
  });
});
