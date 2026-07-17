import { describe, expect, test } from "bun:test";
import { createMySqlMonitor } from "../test-utils/fixtures/monitors";
import type { Monitor } from "../types/crd";
import type { CheckContext } from "./context";
import { createCheckMySql, type MySqlClientConfig } from "./mysql";

function context(values: Record<string, string>): CheckContext {
  return {
    signal: new AbortController().signal,
    resolveSecret: async (ref) => values[ref.key] ?? "",
    wallNow: () => new Date(),
    monotonicNow: () => performance.now(),
  };
}

describe("attempt-local checker credentials", () => {
  test("concurrent monitors cannot observe each other's Secret values", async () => {
    const observed: MySqlClientConfig[] = [];
    const checker = createCheckMySql(async (config) => {
      observed.push(config);
      await Bun.sleep(5);
      return {
        connect: async () => undefined,
        query: async () => undefined,
        end: async () => undefined,
      };
    });
    const first = createMySqlMonitor({ secretName: "first" }) as Monitor;
    const second = {
      ...createMySqlMonitor({ secretName: "second" }),
      metadata: { name: "second", namespace: "default" },
    } as Monitor;

    await Promise.all([
      checker(first, 5, context({ username: "alice", password: "alpha" })),
      checker(second, 5, context({ username: "bob", password: "beta" })),
    ]);

    expect(observed.map(({ user, password }) => ({ user, password }))).toEqual([
      { user: "alice", password: "alpha" },
      { user: "bob", password: "beta" },
    ]);
  });
});
