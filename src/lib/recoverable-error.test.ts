import { describe, expect, test } from "bun:test";
import { isRecoverableAsyncError } from "./recoverable-error";

describe("isRecoverableAsyncError", () => {
  test("returns true for TimeoutError DOMException", () => {
    const error = new DOMException("The operation timed out.", "TimeoutError");

    expect(isRecoverableAsyncError(error)).toBe(true);
  });

  test("returns true for AbortError DOMException", () => {
    const error = new DOMException("This operation was aborted", "AbortError");

    expect(isRecoverableAsyncError(error)).toBe(true);
  });

  test("returns false for regular errors", () => {
    expect(isRecoverableAsyncError(new Error("boom"))).toBe(false);
  });
});
