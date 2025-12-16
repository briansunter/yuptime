import type { Selector } from "../types/crd";

/**
 * Check if a monitor matches a selector
 */
export function matchesSelector(
  selector: Selector | undefined,
  monitor: {
    namespace: string;
    name: string;
    labels?: Record<string, string>;
    tags?: string[];
  }
): boolean {
  if (!selector) return true;

  // Check namespace match
  if (selector.matchNamespaces && selector.matchNamespaces.length > 0) {
    if (!selector.matchNamespaces.includes(monitor.namespace)) {
      return false;
    }
  }

  // Check label match
  if (selector.matchLabels) {
    const labels = monitor.labels || {};
    const selectors = selector.matchLabels;

    if (selectors.matchLabels) {
      for (const [key, value] of Object.entries(selectors.matchLabels)) {
        if (labels[key] !== value) {
          return false;
        }
      }
    }

    // Handle label expressions
    if (selectors.matchExpressions) {
      for (const expr of selectors.matchExpressions) {
        const labelValue = labels[expr.key];

        switch (expr.operator) {
          case "In":
            if (!expr.values?.includes(labelValue)) return false;
            break;
          case "NotIn":
            if (expr.values?.includes(labelValue)) return false;
            break;
          case "Exists":
            if (labelValue === undefined) return false;
            break;
          case "DoesNotExist":
            if (labelValue !== undefined) return false;
            break;
        }
      }
    }
  }

  // Check tag match
  if (selector.matchTags && selector.matchTags.length > 0) {
    const monitorTags = monitor.tags || [];
    const hasMatch = selector.matchTags.some((tag) => monitorTags.includes(tag));
    if (!hasMatch) return false;
  }

  // Check exact name match
  if (selector.matchNames && selector.matchNames.length > 0) {
    const hasMatch = selector.matchNames.some(
      (ref) => ref.namespace === monitor.namespace && ref.name === monitor.name
    );
    if (!hasMatch) return false;
  }

  return true;
}

/**
 * Check if an object matches a list of selectors (OR logic)
 */
export function matchesAnySelectorIn(
  selectors: (Selector | undefined)[],
  monitor: {
    namespace: string;
    name: string;
    labels?: Record<string, string>;
    tags?: string[];
  }
): boolean {
  if (selectors.length === 0) return true;
  return selectors.some((selector) => matchesSelector(selector, monitor));
}

/**
 * Check if an object matches all selectors (AND logic)
 */
export function matchesAllSelectors(
  selectors: (Selector | undefined)[],
  monitor: {
    namespace: string;
    name: string;
    labels?: Record<string, string>;
    tags?: string[];
  }
): boolean {
  return selectors.every((selector) => matchesSelector(selector, monitor));
}

/**
 * Filter monitors by selector
 */
export function filterBySelector(
  monitors: Array<{
    namespace: string;
    name: string;
    labels?: Record<string, string>;
    tags?: string[];
  }>,
  selector: Selector | undefined
) {
  return monitors.filter((monitor) => matchesSelector(selector, monitor));
}
