import type { Selector } from "../types/crd";

type MonitorRef = {
  namespace: string;
  name: string;
  labels?: Record<string, string>;
  tags?: string[];
};

function matchesNamespace(selector: Selector, monitor: MonitorRef): boolean {
  if (!selector.matchNamespaces || selector.matchNamespaces.length === 0) {
    return true;
  }
  return selector.matchNamespaces.includes(monitor.namespace);
}

function matchesLabelExpression(
  expr: { key: string; operator: string; values?: string[] },
  labels: Record<string, string>,
): boolean {
  const labelValue = labels[expr.key];

  switch (expr.operator) {
    case "In":
      return Boolean(expr.values && labelValue && expr.values.includes(labelValue));
    case "NotIn":
      return !(expr.values && labelValue && expr.values.includes(labelValue));
    case "Exists":
      return labelValue !== undefined;
    case "DoesNotExist":
      return labelValue === undefined;
    default:
      return true;
  }
}

function matchesLabels(selector: Selector, monitor: MonitorRef): boolean {
  if (!selector.matchLabels) {
    return true;
  }

  const labels = monitor.labels || {};
  const selectors = selector.matchLabels;

  if (selectors.matchLabels) {
    for (const [key, value] of Object.entries(selectors.matchLabels)) {
      if (labels[key] !== value) {
        return false;
      }
    }
  }

  if (selectors.matchExpressions) {
    for (const expr of selectors.matchExpressions) {
      if (!matchesLabelExpression(expr, labels)) {
        return false;
      }
    }
  }

  return true;
}

function matchesTags(selector: Selector, monitor: MonitorRef): boolean {
  if (!selector.matchTags || selector.matchTags.length === 0) {
    return true;
  }
  const monitorTags = monitor.tags || [];
  return selector.matchTags.some((tag) => monitorTags.includes(tag));
}

function matchesNames(selector: Selector, monitor: MonitorRef): boolean {
  if (!selector.matchNames || selector.matchNames.length === 0) {
    return true;
  }
  return selector.matchNames.some(
    (ref) => ref.namespace === monitor.namespace && ref.name === monitor.name,
  );
}

/**
 * Check if a monitor matches a selector
 */
export function matchesSelector(selector: Selector | undefined, monitor: MonitorRef): boolean {
  if (!selector) return true;
  return (
    matchesNamespace(selector, monitor) &&
    matchesLabels(selector, monitor) &&
    matchesTags(selector, monitor) &&
    matchesNames(selector, monitor)
  );
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
  },
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
  },
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
  selector: Selector | undefined,
) {
  return monitors.filter((monitor) => matchesSelector(selector, monitor));
}
