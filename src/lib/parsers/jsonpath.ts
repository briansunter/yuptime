/**
 * JSONPath parser using jsonpath-plus
 * Supports full JSONPath syntax including wildcards, filters, and recursive descent
 */

import { JSONPath } from "jsonpath-plus";

export interface JsonPathResult {
  success: boolean;
  values: unknown[];
  error?: string;
}

export interface JsonPathCriteria {
  equals?: unknown;
  contains?: string;
  exists?: boolean;
  count?: number;
  greaterThan?: number;
  lessThan?: number;
}

/**
 * Execute JSONPath query with backwards compatibility
 * Supports both simple dot notation and full JSONPath syntax
 */
export function queryJsonPath(data: unknown, path: string): JsonPathResult {
  try {
    // Normalize path - add $ prefix if not present for backwards compatibility
    const normalizedPath = path.startsWith("$") ? path : `$.${path}`;

    const results = JSONPath({
      path: normalizedPath,
      json: data as object,
      wrap: true, // Always return array
    }) as unknown[];

    return {
      success: true,
      values: results,
    };
  } catch (error) {
    return {
      success: false,
      values: [],
      error: error instanceof Error ? error.message : "JSONPath evaluation failed",
    };
  }
}

/**
 * Check if JSONPath result matches criteria
 */
export function validateJsonPathResult(
  result: JsonPathResult,
  criteria: JsonPathCriteria,
): { valid: boolean; message: string } {
  if (!result.success) {
    return { valid: false, message: result.error || "JSONPath query failed" };
  }

  const values = result.values;

  // Check exists
  if (criteria.exists !== undefined) {
    const exists = values.length > 0 && values[0] !== undefined;
    if (criteria.exists && !exists) {
      return { valid: false, message: "JSONPath did not match any value" };
    }
    if (!criteria.exists && exists) {
      return { valid: false, message: "JSONPath unexpectedly matched a value" };
    }
  }

  // Check count
  if (criteria.count !== undefined && values.length !== criteria.count) {
    return {
      valid: false,
      message: `Expected ${criteria.count} matches, got ${values.length}`,
    };
  }

  // Check equals (first value)
  if (criteria.equals !== undefined) {
    const firstValue = values[0];
    if (JSON.stringify(firstValue) !== JSON.stringify(criteria.equals)) {
      return {
        valid: false,
        message: `Value "${JSON.stringify(firstValue)}" does not equal "${JSON.stringify(criteria.equals)}"`,
      };
    }
  }

  // Check contains (string in first value)
  if (criteria.contains !== undefined) {
    const firstValue = String(values[0] ?? "");
    if (!firstValue.includes(criteria.contains)) {
      return {
        valid: false,
        message: `Value does not contain "${criteria.contains}"`,
      };
    }
  }

  // Check numeric comparisons
  if (criteria.greaterThan !== undefined) {
    const numValue = Number(values[0]);
    if (Number.isNaN(numValue) || numValue <= criteria.greaterThan) {
      return {
        valid: false,
        message: `Value ${values[0]} is not greater than ${criteria.greaterThan}`,
      };
    }
  }

  if (criteria.lessThan !== undefined) {
    const numValue = Number(values[0]);
    if (Number.isNaN(numValue) || numValue >= criteria.lessThan) {
      return {
        valid: false,
        message: `Value ${values[0]} is not less than ${criteria.lessThan}`,
      };
    }
  }

  return { valid: true, message: "JSONPath criteria satisfied" };
}
