import { describe, expect, test } from "bun:test";
import {
  filterBySelector,
  matchesAllSelectors,
  matchesAnySelectorIn,
  matchesSelector,
} from "./selectors";

describe("matchesSelector", () => {
  test("matches all when selector is undefined", () => {
    const monitor = { namespace: "default", name: "test" };
    expect(matchesSelector(undefined, monitor)).toBe(true);
  });

  test("matches by namespace", () => {
    const selector = { matchNamespaces: ["production", "staging"] };
    expect(
      matchesSelector(selector, { namespace: "production", name: "test" }),
    ).toBe(true);
    expect(
      matchesSelector(selector, { namespace: "staging", name: "test" }),
    ).toBe(true);
    expect(
      matchesSelector(selector, { namespace: "development", name: "test" }),
    ).toBe(false);
  });

  test("matches by name reference", () => {
    const selector = {
      matchNames: [
        { namespace: "default", name: "monitor-a" },
        { namespace: "default", name: "monitor-b" },
      ],
    };
    expect(
      matchesSelector(selector, { namespace: "default", name: "monitor-a" }),
    ).toBe(true);
    expect(
      matchesSelector(selector, { namespace: "default", name: "monitor-c" }),
    ).toBe(false);
    expect(
      matchesSelector(selector, { namespace: "other", name: "monitor-a" }),
    ).toBe(false);
  });

  test("matches by labels with matchLabels", () => {
    const selector = {
      matchLabels: {
        matchLabels: { environment: "production", team: "platform" },
      },
    };
    const monitor = {
      namespace: "default",
      name: "test",
      labels: { environment: "production", team: "platform" },
    };
    expect(matchesSelector(selector, monitor)).toBe(true);
  });

  test("fails when labels do not match", () => {
    const selector = {
      matchLabels: {
        matchLabels: { environment: "production" },
      },
    };
    const monitor = {
      namespace: "default",
      name: "test",
      labels: { environment: "staging" },
    };
    expect(matchesSelector(selector, monitor)).toBe(false);
  });

  test("fails when monitor has no labels but selector requires them", () => {
    const selector = {
      matchLabels: {
        matchLabels: { environment: "production" },
      },
    };
    const monitor = { namespace: "default", name: "test" };
    expect(matchesSelector(selector, monitor)).toBe(false);
  });

  test("matches with In operator", () => {
    const selector = {
      matchLabels: {
        matchExpressions: [
          {
            key: "tier",
            operator: "In" as const,
            values: ["frontend", "backend"],
          },
        ],
      },
    };
    expect(
      matchesSelector(selector, {
        namespace: "default",
        name: "test",
        labels: { tier: "frontend" },
      }),
    ).toBe(true);
    expect(
      matchesSelector(selector, {
        namespace: "default",
        name: "test",
        labels: { tier: "database" },
      }),
    ).toBe(false);
  });

  test("matches with NotIn operator", () => {
    const selector = {
      matchLabels: {
        matchExpressions: [
          { key: "tier", operator: "NotIn" as const, values: ["test", "dev"] },
        ],
      },
    };
    expect(
      matchesSelector(selector, {
        namespace: "default",
        name: "test",
        labels: { tier: "production" },
      }),
    ).toBe(true);
    expect(
      matchesSelector(selector, {
        namespace: "default",
        name: "test",
        labels: { tier: "test" },
      }),
    ).toBe(false);
  });

  test("matches with Exists operator", () => {
    const selector = {
      matchLabels: {
        matchExpressions: [{ key: "monitored", operator: "Exists" as const }],
      },
    };
    expect(
      matchesSelector(selector, {
        namespace: "default",
        name: "test",
        labels: { monitored: "true" },
      }),
    ).toBe(true);
    expect(
      matchesSelector(selector, {
        namespace: "default",
        name: "test",
        labels: {},
      }),
    ).toBe(false);
  });

  test("matches with DoesNotExist operator", () => {
    const selector = {
      matchLabels: {
        matchExpressions: [
          { key: "skip-monitoring", operator: "DoesNotExist" as const },
        ],
      },
    };
    expect(
      matchesSelector(selector, {
        namespace: "default",
        name: "test",
        labels: {},
      }),
    ).toBe(true);
    expect(
      matchesSelector(selector, {
        namespace: "default",
        name: "test",
        labels: { "skip-monitoring": "true" },
      }),
    ).toBe(false);
  });

  test("matches by tags", () => {
    const selector = { matchTags: ["critical", "production"] };
    expect(
      matchesSelector(selector, {
        namespace: "default",
        name: "test",
        tags: ["critical"],
      }),
    ).toBe(true);
    expect(
      matchesSelector(selector, {
        namespace: "default",
        name: "test",
        tags: ["staging"],
      }),
    ).toBe(false);
  });

  test("combines multiple selector criteria with AND", () => {
    const selector = {
      matchNamespaces: ["production"],
      matchLabels: { matchLabels: { team: "platform" } },
    };
    // Both match
    expect(
      matchesSelector(selector, {
        namespace: "production",
        name: "test",
        labels: { team: "platform" },
      }),
    ).toBe(true);
    // Namespace matches, labels don't
    expect(
      matchesSelector(selector, {
        namespace: "production",
        name: "test",
        labels: { team: "other" },
      }),
    ).toBe(false);
    // Labels match, namespace doesn't
    expect(
      matchesSelector(selector, {
        namespace: "staging",
        name: "test",
        labels: { team: "platform" },
      }),
    ).toBe(false);
  });
});

describe("matchesAnySelectorIn", () => {
  test("returns true for empty selector list", () => {
    expect(
      matchesAnySelectorIn([], { namespace: "default", name: "test" }),
    ).toBe(true);
  });

  test("matches if any selector matches (OR logic)", () => {
    const selectors = [
      { matchNamespaces: ["production"] },
      { matchNamespaces: ["staging"] },
    ];
    expect(
      matchesAnySelectorIn(selectors, { namespace: "staging", name: "test" }),
    ).toBe(true);
    expect(
      matchesAnySelectorIn(selectors, { namespace: "dev", name: "test" }),
    ).toBe(false);
  });
});

describe("matchesAllSelectors", () => {
  test("requires all selectors to match (AND logic)", () => {
    const selectors = [
      { matchNamespaces: ["production"] },
      { matchLabels: { matchLabels: { critical: "true" } } },
    ];
    // Both match
    expect(
      matchesAllSelectors(selectors, {
        namespace: "production",
        name: "test",
        labels: { critical: "true" },
      }),
    ).toBe(true);
    // Only one matches
    expect(
      matchesAllSelectors(selectors, {
        namespace: "production",
        name: "test",
        labels: {},
      }),
    ).toBe(false);
  });
});

describe("filterBySelector", () => {
  test("filters monitors by selector", () => {
    const monitors = [
      { namespace: "production", name: "api" },
      { namespace: "staging", name: "api" },
      { namespace: "production", name: "web" },
    ];
    const selector = { matchNamespaces: ["production"] };
    const filtered = filterBySelector(monitors, selector);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.namespace)).toEqual([
      "production",
      "production",
    ]);
  });

  test("returns all when selector is undefined", () => {
    const monitors = [
      { namespace: "a", name: "1" },
      { namespace: "b", name: "2" },
    ];
    expect(filterBySelector(monitors, undefined)).toHaveLength(2);
  });
});
