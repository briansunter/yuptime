import { describe, expect, test } from "bun:test";
import { queryCssSelector, validateCssSelectorResult } from "./css-selector";

describe("queryCssSelector", () => {
  const sampleHtml = `
<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <div id="status" class="healthy">System is running</div>
  <div class="metric" data-value="100">CPU: 45%</div>
  <ul class="items">
    <li class="item active">Item 1</li>
    <li class="item">Item 2</li>
    <li class="item">Item 3</li>
  </ul>
  <form id="login-form">
    <input type="text" name="username" placeholder="Username">
    <input type="password" name="password">
    <button type="submit">Login</button>
  </form>
  <a href="https://example.com" class="external">External Link</a>
</body>
</html>`;

  test("supports ID selector", () => {
    const result = queryCssSelector(sampleHtml, "#status");
    expect(result.success).toBe(true);
    expect(result.elements.length).toBe(1);
    expect(result.elements[0]?.text).toBe("System is running");
  });

  test("supports class selector", () => {
    const result = queryCssSelector(sampleHtml, ".item");
    expect(result.success).toBe(true);
    expect(result.elements.length).toBe(3);
  });

  test("supports combined selectors", () => {
    const result = queryCssSelector(sampleHtml, ".item.active");
    expect(result.success).toBe(true);
    expect(result.elements.length).toBe(1);
    expect(result.elements[0]?.text).toBe("Item 1");
  });

  test("supports attribute existence selector", () => {
    const result = queryCssSelector(sampleHtml, "[data-value]");
    expect(result.success).toBe(true);
    expect(result.elements.length).toBe(1);
  });

  test("supports attribute value selector", () => {
    const result = queryCssSelector(sampleHtml, "input[type='password']");
    expect(result.success).toBe(true);
    expect(result.elements.length).toBe(1);
  });

  test("supports attribute contains selector", () => {
    const result = queryCssSelector(sampleHtml, "a[href*='example']");
    expect(result.success).toBe(true);
    expect(result.elements.length).toBe(1);
  });

  test("supports descendant selectors", () => {
    const result = queryCssSelector(sampleHtml, "#login-form input");
    expect(result.success).toBe(true);
    expect(result.elements.length).toBe(2);
  });

  test("supports direct child selector", () => {
    const result = queryCssSelector(sampleHtml, "ul.items > li");
    expect(result.success).toBe(true);
    expect(result.elements.length).toBe(3);
  });

  test("extracts element attributes", () => {
    const result = queryCssSelector(sampleHtml, ".metric");
    expect(result.success).toBe(true);
    expect(result.elements[0]?.attributes["data-value"]).toBe("100");
  });

  test("returns empty for non-matching selector", () => {
    const result = queryCssSelector(sampleHtml, "#nonexistent");
    expect(result.success).toBe(true);
    expect(result.elements).toEqual([]);
  });

  test("handles malformed HTML gracefully", () => {
    const result = queryCssSelector("<div>unclosed", "div");
    expect(result.success).toBe(true);
    expect(result.elements.length).toBe(1);
  });

  test("extracts inner HTML", () => {
    const result = queryCssSelector(sampleHtml, "button");
    expect(result.success).toBe(true);
    expect(result.elements[0]?.html).toBe("Login");
  });
});

describe("validateCssSelectorResult", () => {
  const mockElement = {
    tagName: "div",
    text: "Hello World",
    attributes: { class: "status healthy", "data-value": "100" },
    html: "Hello World",
  };

  test("validates exists correctly", () => {
    expect(
      validateCssSelectorResult({ success: true, elements: [mockElement] }, { exists: true }).valid,
    ).toBe(true);
    expect(validateCssSelectorResult({ success: true, elements: [] }, { exists: true }).valid).toBe(
      false,
    );
    expect(
      validateCssSelectorResult({ success: true, elements: [] }, { exists: false }).valid,
    ).toBe(true);
  });

  test("validates count correctly", () => {
    const result = { success: true, elements: [mockElement, mockElement] };
    expect(validateCssSelectorResult(result, { count: 2 }).valid).toBe(true);
    expect(validateCssSelectorResult(result, { count: 1 }).valid).toBe(false);
  });

  test("validates text.equals correctly", () => {
    const result = { success: true, elements: [mockElement] };
    expect(validateCssSelectorResult(result, { text: { equals: "Hello World" } }).valid).toBe(true);
    expect(validateCssSelectorResult(result, { text: { equals: "Goodbye" } }).valid).toBe(false);
  });

  test("validates text.contains correctly", () => {
    const result = { success: true, elements: [mockElement] };
    expect(validateCssSelectorResult(result, { text: { contains: "World" } }).valid).toBe(true);
    expect(validateCssSelectorResult(result, { text: { contains: "Missing" } }).valid).toBe(false);
  });

  test("validates text.matches (regex) correctly", () => {
    const result = { success: true, elements: [mockElement] };
    expect(validateCssSelectorResult(result, { text: { matches: "Hello.*" } }).valid).toBe(true);
    expect(validateCssSelectorResult(result, { text: { matches: "^Goodbye" } }).valid).toBe(false);
  });

  test("handles invalid regex gracefully", () => {
    const result = { success: true, elements: [mockElement] };
    const validation = validateCssSelectorResult(result, { text: { matches: "[invalid" } });
    expect(validation.valid).toBe(false);
    expect(validation.message).toContain("Invalid regex");
  });

  test("validates attribute.exists correctly", () => {
    const result = { success: true, elements: [mockElement] };
    expect(
      validateCssSelectorResult(result, { attribute: { name: "data-value", exists: true } }).valid,
    ).toBe(true);
    expect(
      validateCssSelectorResult(result, { attribute: { name: "missing", exists: true } }).valid,
    ).toBe(false);
    expect(
      validateCssSelectorResult(result, { attribute: { name: "missing", exists: false } }).valid,
    ).toBe(true);
  });

  test("validates attribute.equals correctly", () => {
    const result = { success: true, elements: [mockElement] };
    expect(
      validateCssSelectorResult(result, { attribute: { name: "data-value", equals: "100" } }).valid,
    ).toBe(true);
    expect(
      validateCssSelectorResult(result, { attribute: { name: "data-value", equals: "200" } }).valid,
    ).toBe(false);
  });

  test("validates attribute.contains correctly", () => {
    const result = { success: true, elements: [mockElement] };
    expect(
      validateCssSelectorResult(result, { attribute: { name: "class", contains: "healthy" } })
        .valid,
    ).toBe(true);
    expect(
      validateCssSelectorResult(result, { attribute: { name: "class", contains: "error" } }).valid,
    ).toBe(false);
  });

  test("fails validation when query failed", () => {
    const result = { success: false, elements: [], error: "Parse error" };
    const validation = validateCssSelectorResult(result, { exists: true });
    expect(validation.valid).toBe(false);
    expect(validation.message).toBe("Parse error");
  });
});
