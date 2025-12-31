/**
 * XML/XPath parser using fast-xml-parser
 * Supports parsing XML and querying with simplified XPath-like syntax
 */

import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface XPathResult {
  success: boolean;
  values: string[];
  error?: string;
}

export interface XPathCriteria {
  equals?: string;
  contains?: string;
  exists?: boolean;
  count?: number;
}

export interface XmlParserOptions {
  ignoreNamespace?: boolean;
  preserveOrder?: boolean;
}

/**
 * Parse XML and execute simplified XPath-like query
 *
 * Supported syntax:
 * - /root/child/element - absolute path
 * - //element - recursive descent (find anywhere)
 * - /element/@attribute - attribute access
 * - /element/text() - text content
 * - /element[@attr='value'] - attribute predicate
 */
export function queryXPath(xml: string, path: string, options: XmlParserOptions = {}): XPathResult {
  try {
    // Validate XML first
    const validation = XMLValidator.validate(xml);
    if (validation !== true) {
      return {
        success: false,
        values: [],
        error: `Invalid XML: ${JSON.stringify(validation)}`,
      };
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      removeNSPrefix: options.ignoreNamespace ?? false,
      preserveOrder: options.preserveOrder ?? false,
    });

    const parsed = parser.parse(xml);

    // Execute simplified XPath query
    const values = executeSimplifiedXPath(parsed, path);

    return {
      success: true,
      values: values.map((v) => (typeof v === "string" ? v : JSON.stringify(v))),
    };
  } catch (error) {
    return {
      success: false,
      values: [],
      error: error instanceof Error ? error.message : "XML parsing failed",
    };
  }
}

/**
 * Simplified XPath execution
 */
function executeSimplifiedXPath(obj: unknown, path: string): unknown[] {
  const results: unknown[] = [];

  // Handle //element (recursive descent)
  if (path.startsWith("//")) {
    const firstPart = path.slice(2).split("/")[0] ?? "";
    const elementName = firstPart.split("[")[0]?.split("@")[0] ?? "";
    findAllElements(obj, elementName, results, path);
    return results;
  }

  // Handle /path/to/element
  const parts = path.split("/").filter((p) => p !== "");
  let current: unknown = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === undefined) {
      continue;
    }

    if (current === null || current === undefined) {
      return [];
    }

    // Handle text() function
    if (part === "text()") {
      // fast-xml-parser stores text directly when element has no children
      if (typeof current === "string" || typeof current === "number") {
        results.push(String(current));
      } else if (typeof current === "object" && current !== null) {
        const textValue = (current as Record<string, unknown>)["#text"];
        if (textValue !== undefined) {
          results.push(String(textValue));
        }
      }
      return results;
    }

    // Handle @attribute
    if (part.startsWith("@")) {
      const attrName = part.slice(1);
      // Handle array of elements (get attribute from each)
      if (Array.isArray(current)) {
        for (const item of current) {
          if (typeof item === "object" && item !== null) {
            const attrValue = (item as Record<string, unknown>)[`@_${attrName}`];
            if (attrValue !== undefined) {
              results.push(String(attrValue));
            }
          }
        }
      } else if (typeof current === "object" && current !== null) {
        const attrValue = (current as Record<string, unknown>)[`@_${attrName}`];
        if (attrValue !== undefined) {
          results.push(String(attrValue));
        }
      }
      return results;
    }

    // Handle element[@attr='value'] predicate
    const predicateMatch = part.match(/^(\w+)\[@(\w+)=['"]([^'"]+)['"]\]$/);
    if (predicateMatch) {
      const [, elementName, attrName, attrValue] = predicateMatch;
      if (!elementName || !attrName || !attrValue) {
        return [];
      }
      const elements = getElements(current, elementName);
      current = elements.find((el) => {
        if (typeof el === "object" && el !== null) {
          return (el as Record<string, unknown>)[`@_${attrName}`] === attrValue;
        }
        return false;
      });
      continue;
    }

    // Handle simple element name
    current = getElement(current, part);
  }

  if (current !== undefined) {
    // Extract text content if it's an object with #text
    if (typeof current === "object" && current !== null && "#text" in (current as object)) {
      results.push(String((current as Record<string, unknown>)["#text"]));
    } else {
      results.push(current);
    }
  }

  return results;
}

/**
 * Get a single element by name from an object
 */
function getElement(obj: unknown, name: string): unknown {
  if (typeof obj !== "object" || obj === null) {
    return undefined;
  }
  return (obj as Record<string, unknown>)[name];
}

/**
 * Get all elements with a name (handles arrays)
 */
function getElements(obj: unknown, name: string): unknown[] {
  if (typeof obj !== "object" || obj === null) {
    return [];
  }
  const value = (obj as Record<string, unknown>)[name];
  if (Array.isArray(value)) {
    return value;
  }
  if (value !== undefined) {
    return [value];
  }
  return [];
}

/**
 * Recursively find all elements with a given name
 */
function findAllElements(obj: unknown, name: string, results: unknown[], fullPath: string): void {
  if (typeof obj !== "object" || obj === null) {
    return;
  }

  const record = obj as Record<string, unknown>;

  // Check if this object has the element we're looking for
  if (name in record) {
    const value = record[name];
    if (Array.isArray(value)) {
      for (const item of value) {
        processFoundElement(item, fullPath, results);
      }
    } else {
      processFoundElement(value, fullPath, results);
    }
  }

  // Recurse into child elements
  for (const key of Object.keys(record)) {
    if (!key.startsWith("@_") && key !== "#text") {
      const value = record[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          findAllElements(item, name, results, fullPath);
        }
      } else if (typeof value === "object") {
        findAllElements(value, name, results, fullPath);
      }
    }
  }
}

/**
 * Process a found element, applying any remaining path operations
 */
function processFoundElement(element: unknown, fullPath: string, results: unknown[]): void {
  // Check for additional path operations after //element
  const pathParts = fullPath.split("/").filter((p) => p !== "");
  // Find where the // part ends (first non-empty part after //)
  const afterDoubleSlash = pathParts.slice(1); // Skip element name

  if (afterDoubleSlash.length === 0) {
    // No more path parts, extract value
    if (typeof element === "string" || typeof element === "number") {
      results.push(String(element));
    } else if (typeof element === "object" && element !== null && "#text" in (element as object)) {
      results.push(String((element as Record<string, unknown>)["#text"]));
    } else {
      results.push(element);
    }
    return;
  }

  // Continue path traversal with remaining parts
  const remainingPath = `/${afterDoubleSlash.join("/")}`;
  const subResults = executeSimplifiedXPath(element, remainingPath);
  results.push(...subResults);
}

/**
 * Validate XPath result against criteria
 */
export function validateXPathResult(
  result: XPathResult,
  criteria: XPathCriteria,
): { valid: boolean; message: string } {
  if (!result.success) {
    return { valid: false, message: result.error || "XPath query failed" };
  }

  const values = result.values;

  if (criteria.exists !== undefined) {
    const exists = values.length > 0;
    if (criteria.exists && !exists) {
      return { valid: false, message: "XPath did not match any elements" };
    }
    if (!criteria.exists && exists) {
      return { valid: false, message: "XPath unexpectedly matched elements" };
    }
  }

  if (criteria.count !== undefined && values.length !== criteria.count) {
    return {
      valid: false,
      message: `Expected ${criteria.count} matches, got ${values.length}`,
    };
  }

  if (criteria.equals !== undefined) {
    const firstValue = values[0] ?? "";
    if (firstValue !== criteria.equals) {
      return {
        valid: false,
        message: `Value "${firstValue}" does not equal "${criteria.equals}"`,
      };
    }
  }

  if (criteria.contains !== undefined) {
    const firstValue = values[0] ?? "";
    if (!firstValue.includes(criteria.contains)) {
      return {
        valid: false,
        message: `Value does not contain "${criteria.contains}"`,
      };
    }
  }

  return { valid: true, message: "XPath criteria satisfied" };
}
