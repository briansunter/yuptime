import { describe, expect, test } from "bun:test";
import { createSelectorMonitor } from "../test-utils/fixtures/monitors";
import {
  filterBySelector,
  matchesAllSelectors,
  matchesAnySelectorIn,
  matchesSelector,
} from "./selectors";

describe("matchesSelector", () => {
  test("matches all when selector is undefined", () => {
    expect(matchesSelector(undefined, createSelectorMonitor())).toBe(true);
  });

  test("matches by namespace", () => {
    const selector = { matchNamespaces: ["production", "staging"] };
    expect(matchesSelector(selector, createSelectorMonitor({ namespace: "production" }))).toBe(
      true,
    );
    expect(matchesSelector(selector, createSelectorMonitor({ namespace: "staging" }))).toBe(true);
    expect(matchesSelector(selector, createSelectorMonitor({ namespace: "development" }))).toBe(
      false,
    );
  });

  test("matches by name reference", () => {
    const selector = {
      matchNames: [
        { namespace: "default", name: "monitor-a" },
        { namespace: "default", name: "monitor-b" },
      ],
    };
    expect(matchesSelector(selector, createSelectorMonitor({ name: "monitor-a" }))).toBe(true);
    expect(matchesSelector(selector, createSelectorMonitor({ name: "monitor-c" }))).toBe(false);
    expect(
      matchesSelector(selector, createSelectorMonitor({ namespace: "other", name: "monitor-a" })),
    ).toBe(false);
  });

  test("matches by labels with matchLabels", () => {
    const selector = {
      matchLabels: {
        matchLabels: { environment: "production", team: "platform" },
      },
    };
    expect(
      matchesSelector(
        selector,
        createSelectorMonitor({ labels: { environment: "production", team: "platform" } }),
      ),
    ).toBe(true);
  });

  test("fails when labels do not match", () => {
    const selector = {
      matchLabels: {
        matchLabels: { environment: "production" },
      },
    };
    expect(
      matchesSelector(selector, createSelectorMonitor({ labels: { environment: "staging" } })),
    ).toBe(false);
  });

  test("fails when monitor has no labels but selector requires them", () => {
    const selector = {
      matchLabels: {
        matchLabels: { environment: "production" },
      },
    };
    expect(matchesSelector(selector, createSelectorMonitor())).toBe(false);
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
    expect(matchesSelector(selector, createSelectorMonitor({ labels: { tier: "frontend" } }))).toBe(
      true,
    );
    expect(matchesSelector(selector, createSelectorMonitor({ labels: { tier: "database" } }))).toBe(
      false,
    );
  });

  test("matches with NotIn operator", () => {
    const selector = {
      matchLabels: {
        matchExpressions: [{ key: "tier", operator: "NotIn" as const, values: ["test", "dev"] }],
      },
    };
    expect(
      matchesSelector(selector, createSelectorMonitor({ labels: { tier: "production" } })),
    ).toBe(true);
    expect(matchesSelector(selector, createSelectorMonitor({ labels: { tier: "test" } }))).toBe(
      false,
    );
  });

  test("matches with Exists operator", () => {
    const selector = {
      matchLabels: {
        matchExpressions: [{ key: "monitored", operator: "Exists" as const }],
      },
    };
    expect(
      matchesSelector(selector, createSelectorMonitor({ labels: { monitored: "true" } })),
    ).toBe(true);
    expect(matchesSelector(selector, createSelectorMonitor({ labels: {} }))).toBe(false);
  });

  test("matches with DoesNotExist operator", () => {
    const selector = {
      matchLabels: {
        matchExpressions: [{ key: "skip-monitoring", operator: "DoesNotExist" as const }],
      },
    };
    expect(matchesSelector(selector, createSelectorMonitor({ labels: {} }))).toBe(true);
    expect(
      matchesSelector(selector, createSelectorMonitor({ labels: { "skip-monitoring": "true" } })),
    ).toBe(false);
  });

  test("matches by tags", () => {
    const selector = { matchTags: ["critical", "production"] };
    expect(matchesSelector(selector, createSelectorMonitor({ tags: ["critical"] }))).toBe(true);
    expect(matchesSelector(selector, createSelectorMonitor({ tags: ["staging"] }))).toBe(false);
  });

  test("combines multiple selector criteria with AND", () => {
    const selector = {
      matchNamespaces: ["production"],
      matchLabels: { matchLabels: { team: "platform" } },
    };
    // Both match
    expect(
      matchesSelector(
        selector,
        createSelectorMonitor({ namespace: "production", labels: { team: "platform" } }),
      ),
    ).toBe(true);
    // Namespace matches, labels don't
    expect(
      matchesSelector(
        selector,
        createSelectorMonitor({ namespace: "production", labels: { team: "other" } }),
      ),
    ).toBe(false);
    // Labels match, namespace doesn't
    expect(
      matchesSelector(
        selector,
        createSelectorMonitor({ namespace: "staging", labels: { team: "platform" } }),
      ),
    ).toBe(false);
  });
});

describe("matchesAnySelectorIn", () => {
  test("returns true for empty selector list", () => {
    expect(matchesAnySelectorIn([], createSelectorMonitor())).toBe(true);
  });

  test("matches if any selector matches (OR logic)", () => {
    const selectors = [{ matchNamespaces: ["production"] }, { matchNamespaces: ["staging"] }];
    expect(matchesAnySelectorIn(selectors, createSelectorMonitor({ namespace: "staging" }))).toBe(
      true,
    );
    expect(matchesAnySelectorIn(selectors, createSelectorMonitor({ namespace: "dev" }))).toBe(
      false,
    );
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
      matchesAllSelectors(
        selectors,
        createSelectorMonitor({ namespace: "production", labels: { critical: "true" } }),
      ),
    ).toBe(true);
    // Only one matches
    expect(
      matchesAllSelectors(
        selectors,
        createSelectorMonitor({ namespace: "production", labels: {} }),
      ),
    ).toBe(false);
  });
});

describe("filterBySelector", () => {
  test("filters monitors by selector", () => {
    const monitors = [
      createSelectorMonitor({ namespace: "production", name: "api" }),
      createSelectorMonitor({ namespace: "staging", name: "api" }),
      createSelectorMonitor({ namespace: "production", name: "web" }),
    ];
    const selector = { matchNamespaces: ["production"] };
    const filtered = filterBySelector(monitors, selector);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.namespace)).toEqual(["production", "production"]);
  });

  test("returns all when selector is undefined", () => {
    const monitors = [
      createSelectorMonitor({ namespace: "a", name: "1" }),
      createSelectorMonitor({ namespace: "b", name: "2" }),
    ];
    expect(filterBySelector(monitors, undefined)).toHaveLength(2);
  });
});
