/**
 * HTML/CSS selector parser using cheerio
 * Supports full CSS selector syntax for HTML element matching
 */

import * as cheerio from "cheerio";

export interface CssSelectorResult {
  success: boolean;
  elements: ElementInfo[];
  error?: string;
}

export interface ElementInfo {
  tagName: string;
  text: string;
  attributes: Record<string, string>;
  html: string;
}

export interface CssSelectorCriteria {
  exists?: boolean;
  count?: number;
  text?: {
    equals?: string;
    contains?: string;
    matches?: string; // Regex pattern
  };
  attribute?: {
    name: string;
    equals?: string;
    contains?: string;
    exists?: boolean;
  };
}

/**
 * Parse HTML and execute CSS selector query
 */
export function queryCssSelector(html: string, selector: string): CssSelectorResult {
  try {
    const $ = cheerio.load(html);
    const elements = $(selector);

    const elementInfos: ElementInfo[] = [];

    elements.each((_, el) => {
      const $el = $(el);
      elementInfos.push({
        tagName: el.type === "tag" ? el.tagName : "",
        text: $el.text().trim(),
        attributes: el.type === "tag" ? el.attribs || {} : {},
        html: $el.html() || "",
      });
    });

    return {
      success: true,
      elements: elementInfos,
    };
  } catch (error) {
    return {
      success: false,
      elements: [],
      error: error instanceof Error ? error.message : "HTML parsing failed",
    };
  }
}

type Validation = { valid: boolean; message: string };

function validateExists(elements: ElementInfo[], expected: boolean | undefined): Validation | null {
  if (expected === undefined) return null;
  const exists = elements.length > 0;
  if (expected && !exists) {
    return { valid: false, message: "CSS selector did not match any elements" };
  }
  if (!expected && exists) {
    return { valid: false, message: "CSS selector unexpectedly matched elements" };
  }
  return null;
}

function validateCount(elements: ElementInfo[], expected: number | undefined): Validation | null {
  if (expected === undefined || elements.length === expected) return null;
  return { valid: false, message: `Expected ${expected} elements, got ${elements.length}` };
}

function validateTextCriteria(
  element: ElementInfo,
  text: NonNullable<CssSelectorCriteria["text"]>,
): Validation | null {
  const value = element.text;

  if (text.equals !== undefined && value !== text.equals) {
    return { valid: false, message: `Element text "${value}" does not equal "${text.equals}"` };
  }

  if (text.contains !== undefined && !value.includes(text.contains)) {
    return { valid: false, message: `Element text does not contain "${text.contains}"` };
  }

  if (text.matches !== undefined) {
    try {
      if (!new RegExp(text.matches).test(value)) {
        return {
          valid: false,
          message: `Element text does not match pattern "${text.matches}"`,
        };
      }
    } catch {
      return { valid: false, message: `Invalid regex pattern: ${text.matches}` };
    }
  }

  return null;
}

function validateAttributeCriteria(
  element: ElementInfo,
  attribute: NonNullable<CssSelectorCriteria["attribute"]>,
): Validation | null {
  const attrName = attribute.name;
  const attrValue = element.attributes[attrName];
  const attrExists = attrValue !== undefined;

  if (attribute.exists !== undefined) {
    if (attribute.exists && !attrExists) {
      return { valid: false, message: `Attribute "${attrName}" does not exist` };
    }
    if (!attribute.exists && attrExists) {
      return { valid: false, message: `Attribute "${attrName}" unexpectedly exists` };
    }
  }

  if (attribute.equals !== undefined && attrValue !== attribute.equals) {
    return {
      valid: false,
      message: `Attribute "${attrName}" value "${attrValue}" does not equal "${attribute.equals}"`,
    };
  }

  if (attribute.contains !== undefined && !attrValue?.includes(attribute.contains)) {
    return {
      valid: false,
      message: `Attribute "${attrName}" does not contain "${attribute.contains}"`,
    };
  }

  return null;
}

/**
 * Validate CSS selector result against criteria
 */
export function validateCssSelectorResult(
  result: CssSelectorResult,
  criteria: CssSelectorCriteria,
): Validation {
  if (!result.success) {
    return { valid: false, message: result.error || "CSS selector query failed" };
  }

  const elements = result.elements;
  const checks: (Validation | null)[] = [
    validateExists(elements, criteria.exists),
    validateCount(elements, criteria.count),
  ];

  const firstElement = elements[0];
  if (firstElement) {
    if (criteria.text) checks.push(validateTextCriteria(firstElement, criteria.text));
    if (criteria.attribute)
      checks.push(validateAttributeCriteria(firstElement, criteria.attribute));
  }

  for (const failure of checks) {
    if (failure) return failure;
  }

  return { valid: true, message: "CSS selector criteria satisfied" };
}
