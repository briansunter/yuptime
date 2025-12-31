import { describe, expect, test } from "bun:test";
import { queryXPath, validateXPathResult } from "./xpath";

describe("queryXPath", () => {
  const sampleXml = `<?xml version="1.0"?>
<root>
  <status>healthy</status>
  <items>
    <item id="1" type="active">First</item>
    <item id="2" type="inactive">Second</item>
  </items>
  <metrics>
    <count>100</count>
  </metrics>
</root>`;

  test("supports absolute paths", () => {
    const result = queryXPath(sampleXml, "/root/status");
    expect(result.success).toBe(true);
    expect(result.values).toContain("healthy");
  });

  test("supports text() function", () => {
    const result = queryXPath(sampleXml, "/root/status/text()");
    expect(result.success).toBe(true);
    expect(result.values).toEqual(["healthy"]);
  });

  test("supports nested paths", () => {
    const result = queryXPath(sampleXml, "/root/metrics/count/text()");
    expect(result.success).toBe(true);
    expect(result.values).toEqual(["100"]);
  });

  test("supports recursive descent //", () => {
    const result = queryXPath(sampleXml, "//count/text()");
    expect(result.success).toBe(true);
    expect(result.values).toEqual(["100"]);
  });

  test("supports attribute access @", () => {
    const result = queryXPath(sampleXml, "/root/items/item/@id");
    expect(result.success).toBe(true);
    expect(result.values.length).toBeGreaterThan(0);
  });

  test("supports attribute predicates", () => {
    const result = queryXPath(sampleXml, "/root/items/item[@type='active']");
    expect(result.success).toBe(true);
    expect(result.values.length).toBe(1);
  });

  test("supports id predicates", () => {
    const result = queryXPath(sampleXml, "/root/items/item[@id='2']/text()");
    expect(result.success).toBe(true);
    expect(result.values).toContain("Second");
  });

  test("returns error for invalid XML", () => {
    const result = queryXPath("<invalid><xml>", "/root");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid XML");
  });

  test("returns empty for non-matching path", () => {
    const result = queryXPath(sampleXml, "/root/nonexistent");
    expect(result.success).toBe(true);
    expect(result.values).toEqual([]);
  });

  test("handles namespaces when ignoreNamespace is true", () => {
    const nsXml = `<ns:root xmlns:ns="http://example.com"><ns:status>ok</ns:status></ns:root>`;
    const result = queryXPath(nsXml, "/root/status/text()", { ignoreNamespace: true });
    expect(result.success).toBe(true);
    expect(result.values).toContain("ok");
  });

  test("parses simple XML correctly", () => {
    const simpleXml = "<response><code>200</code><message>OK</message></response>";
    const result = queryXPath(simpleXml, "/response/code/text()");
    expect(result.success).toBe(true);
    expect(result.values).toContain("200");
  });
});

describe("validateXPathResult", () => {
  test("validates exists correctly", () => {
    expect(validateXPathResult({ success: true, values: ["value"] }, { exists: true }).valid).toBe(
      true,
    );
    expect(validateXPathResult({ success: true, values: [] }, { exists: true }).valid).toBe(false);
    expect(validateXPathResult({ success: true, values: [] }, { exists: false }).valid).toBe(true);
  });

  test("validates count correctly", () => {
    const result = { success: true, values: ["a", "b"] };
    expect(validateXPathResult(result, { count: 2 }).valid).toBe(true);
    expect(validateXPathResult(result, { count: 3 }).valid).toBe(false);
  });

  test("validates equals correctly", () => {
    const result = { success: true, values: ["healthy"] };
    expect(validateXPathResult(result, { equals: "healthy" }).valid).toBe(true);
    expect(validateXPathResult(result, { equals: "unhealthy" }).valid).toBe(false);
  });

  test("validates contains correctly", () => {
    const result = { success: true, values: ["status is healthy"] };
    expect(validateXPathResult(result, { contains: "healthy" }).valid).toBe(true);
    expect(validateXPathResult(result, { contains: "error" }).valid).toBe(false);
  });

  test("fails validation when query failed", () => {
    const result = { success: false, values: [], error: "Parse error" };
    const validation = validateXPathResult(result, { exists: true });
    expect(validation.valid).toBe(false);
    expect(validation.message).toBe("Parse error");
  });
});
