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

type Validation = { valid: boolean; message: string };

function validateExists(values: unknown[], expected: boolean | undefined): Validation | null {
  if (expected === undefined) return null;
  const exists = values.length > 0 && values[0] !== undefined;
  if (expected && !exists) {
    return { valid: false, message: "JSONPath did not match any value" };
  }
  if (!expected && exists) {
    return { valid: false, message: "JSONPath unexpectedly matched a value" };
  }
  return null;
}

function validateCount(values: unknown[], expected: number | undefined): Validation | null {
  if (expected === undefined || values.length === expected) return null;
  return { valid: false, message: `Expected ${expected} matches, got ${values.length}` };
}

function validateEquals(values: unknown[], expected: unknown): Validation | null {
  if (expected === undefined) return null;
  const firstValue = values[0];
  if (JSON.stringify(firstValue) === JSON.stringify(expected)) return null;
  return {
    valid: false,
    message: `Value "${JSON.stringify(firstValue)}" does not equal "${JSON.stringify(expected)}"`,
  };
}

function validateContains(values: unknown[], expected: string | undefined): Validation | null {
  if (expected === undefined) return null;
  const firstValue = String(values[0] ?? "");
  if (firstValue.includes(expected)) return null;
  return { valid: false, message: `Value does not contain "${expected}"` };
}

function validateGreaterThan(values: unknown[], threshold: number | undefined): Validation | null {
  if (threshold === undefined) return null;
  const numValue = Number(values[0]);
  if (!Number.isNaN(numValue) && numValue > threshold) return null;
  return {
    valid: false,
    message: `Value ${values[0]} is not greater than ${threshold}`,
  };
}

function validateLessThan(values: unknown[], threshold: number | undefined): Validation | null {
  if (threshold === undefined) return null;
  const numValue = Number(values[0]);
  if (!Number.isNaN(numValue) && numValue < threshold) return null;
  return {
    valid: false,
    message: `Value ${values[0]} is not less than ${threshold}`,
  };
}

/**
 * Check if JSONPath result matches criteria
 */
export function validateJsonPathResult(
  result: JsonPathResult,
  criteria: JsonPathCriteria,
): Validation {
  if (!result.success) {
    return { valid: false, message: result.error || "JSONPath query failed" };
  }

  const values = result.values;
  const checks = [
    validateExists(values, criteria.exists),
    validateCount(values, criteria.count),
    validateEquals(values, criteria.equals),
    validateContains(values, criteria.contains),
    validateGreaterThan(values, criteria.greaterThan),
    validateLessThan(values, criteria.lessThan),
  ];

  for (const failure of checks) {
    if (failure) return failure;
  }

  return { valid: true, message: "JSONPath criteria satisfied" };
}
