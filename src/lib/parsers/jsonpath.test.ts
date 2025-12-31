import { describe, expect, test } from "bun:test";
import { queryJsonPath, validateJsonPathResult } from "./jsonpath";

describe("queryJsonPath", () => {
  const sampleData = {
    users: [
      { name: "Alice", role: "admin", age: 30 },
      { name: "Bob", role: "user", age: 25 },
      { name: "Charlie", role: "admin", age: 35 },
    ],
    status: "healthy",
    count: 100,
  };

  test("supports simple dot notation (backwards compatible)", () => {
    const result = queryJsonPath(sampleData, "status");
    expect(result.success).toBe(true);
    expect(result.values).toEqual(["healthy"]);
  });

  test("supports $ prefix paths", () => {
    const result = queryJsonPath(sampleData, "$.status");
    expect(result.success).toBe(true);
    expect(result.values).toEqual(["healthy"]);
  });

  test("supports wildcard array access", () => {
    const result = queryJsonPath(sampleData, "$.users[*].name");
    expect(result.success).toBe(true);
    expect(result.values).toEqual(["Alice", "Bob", "Charlie"]);
  });

  test("supports recursive descent", () => {
    const result = queryJsonPath(sampleData, "$..name");
    expect(result.success).toBe(true);
    expect(result.values).toEqual(["Alice", "Bob", "Charlie"]);
  });

  test("supports filter expressions", () => {
    const result = queryJsonPath(sampleData, "$.users[?(@.role=='admin')].name");
    expect(result.success).toBe(true);
    expect(result.values).toEqual(["Alice", "Charlie"]);
  });

  test("supports numeric comparisons in filters", () => {
    const result = queryJsonPath(sampleData, "$.users[?(@.age > 28)].name");
    expect(result.success).toBe(true);
    expect(result.values).toEqual(["Alice", "Charlie"]);
  });

  test("supports array index access", () => {
    const result = queryJsonPath(sampleData, "$.users[0].name");
    expect(result.success).toBe(true);
    expect(result.values).toEqual(["Alice"]);
  });

  test("supports negative array index", () => {
    const result = queryJsonPath(sampleData, "$.users[-1:].name");
    expect(result.success).toBe(true);
    expect(result.values).toEqual(["Charlie"]);
  });

  test("returns empty for non-existent path", () => {
    const result = queryJsonPath(sampleData, "$.nonexistent");
    expect(result.success).toBe(true);
    expect(result.values).toEqual([]);
  });

  test("handles nested paths", () => {
    const data = { outer: { inner: { value: 42 } } };
    const result = queryJsonPath(data, "outer.inner.value");
    expect(result.success).toBe(true);
    expect(result.values).toEqual([42]);
  });
});

describe("validateJsonPathResult", () => {
  test("validates exists: true when values present", () => {
    const result = { success: true, values: ["value"] };
    const validation = validateJsonPathResult(result, { exists: true });
    expect(validation.valid).toBe(true);
  });

  test("fails exists: true when no values", () => {
    const result = { success: true, values: [] };
    const validation = validateJsonPathResult(result, { exists: true });
    expect(validation.valid).toBe(false);
    expect(validation.message).toContain("did not match");
  });

  test("validates exists: false when no values", () => {
    const result = { success: true, values: [] };
    const validation = validateJsonPathResult(result, { exists: false });
    expect(validation.valid).toBe(true);
  });

  test("validates count correctly", () => {
    const result = { success: true, values: ["a", "b", "c"] };
    expect(validateJsonPathResult(result, { count: 3 }).valid).toBe(true);
    expect(validateJsonPathResult(result, { count: 2 }).valid).toBe(false);
  });

  test("validates equals correctly", () => {
    const result = { success: true, values: ["expected"] };
    expect(validateJsonPathResult(result, { equals: "expected" }).valid).toBe(true);
    expect(validateJsonPathResult(result, { equals: "other" }).valid).toBe(false);
  });

  test("validates equals with objects", () => {
    const result = { success: true, values: [{ key: "value" }] };
    expect(validateJsonPathResult(result, { equals: { key: "value" } }).valid).toBe(true);
    expect(validateJsonPathResult(result, { equals: { key: "other" } }).valid).toBe(false);
  });

  test("validates contains correctly", () => {
    const result = { success: true, values: ["hello world"] };
    expect(validateJsonPathResult(result, { contains: "world" }).valid).toBe(true);
    expect(validateJsonPathResult(result, { contains: "missing" }).valid).toBe(false);
  });

  test("validates greaterThan correctly", () => {
    const result = { success: true, values: [100] };
    expect(validateJsonPathResult(result, { greaterThan: 50 }).valid).toBe(true);
    expect(validateJsonPathResult(result, { greaterThan: 100 }).valid).toBe(false);
    expect(validateJsonPathResult(result, { greaterThan: 150 }).valid).toBe(false);
  });

  test("validates lessThan correctly", () => {
    const result = { success: true, values: [50] };
    expect(validateJsonPathResult(result, { lessThan: 100 }).valid).toBe(true);
    expect(validateJsonPathResult(result, { lessThan: 50 }).valid).toBe(false);
    expect(validateJsonPathResult(result, { lessThan: 25 }).valid).toBe(false);
  });

  test("fails validation when query failed", () => {
    const result = { success: false, values: [], error: "Query error" };
    const validation = validateJsonPathResult(result, { exists: true });
    expect(validation.valid).toBe(false);
    expect(validation.message).toBe("Query error");
  });
});
