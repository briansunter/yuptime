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

/**
 * Validate CSS selector result against criteria
 */
export function validateCssSelectorResult(
  result: CssSelectorResult,
  criteria: CssSelectorCriteria,
): { valid: boolean; message: string } {
  if (!result.success) {
    return { valid: false, message: result.error || "CSS selector query failed" };
  }

  const elements = result.elements;

  // Check exists
  if (criteria.exists !== undefined) {
    const exists = elements.length > 0;
    if (criteria.exists && !exists) {
      return { valid: false, message: "CSS selector did not match any elements" };
    }
    if (!criteria.exists && exists) {
      return { valid: false, message: "CSS selector unexpectedly matched elements" };
    }
  }

  // Check count
  if (criteria.count !== undefined && elements.length !== criteria.count) {
    return {
      valid: false,
      message: `Expected ${criteria.count} elements, got ${elements.length}`,
    };
  }

  // Check text of first element
  const firstElement = elements[0];
  if (criteria.text && firstElement) {
    const text = firstElement.text;

    if (criteria.text.equals !== undefined && text !== criteria.text.equals) {
      return {
        valid: false,
        message: `Element text "${text}" does not equal "${criteria.text.equals}"`,
      };
    }

    if (criteria.text.contains !== undefined && !text.includes(criteria.text.contains)) {
      return {
        valid: false,
        message: `Element text does not contain "${criteria.text.contains}"`,
      };
    }

    if (criteria.text.matches !== undefined) {
      try {
        const regex = new RegExp(criteria.text.matches);
        if (!regex.test(text)) {
          return {
            valid: false,
            message: `Element text does not match pattern "${criteria.text.matches}"`,
          };
        }
      } catch {
        return { valid: false, message: `Invalid regex pattern: ${criteria.text.matches}` };
      }
    }
  }

  // Check attribute of first element
  if (criteria.attribute && firstElement) {
    const attrs = firstElement.attributes;
    const attrName = criteria.attribute.name;
    const attrValue = attrs[attrName];

    if (criteria.attribute.exists !== undefined) {
      const attrExists = attrValue !== undefined;
      if (criteria.attribute.exists && !attrExists) {
        return { valid: false, message: `Attribute "${attrName}" does not exist` };
      }
      if (!criteria.attribute.exists && attrExists) {
        return { valid: false, message: `Attribute "${attrName}" unexpectedly exists` };
      }
    }

    if (criteria.attribute.equals !== undefined && attrValue !== criteria.attribute.equals) {
      return {
        valid: false,
        message: `Attribute "${attrName}" value "${attrValue}" does not equal "${criteria.attribute.equals}"`,
      };
    }

    if (
      criteria.attribute.contains !== undefined &&
      !attrValue?.includes(criteria.attribute.contains)
    ) {
      return {
        valid: false,
        message: `Attribute "${attrName}" does not contain "${criteria.attribute.contains}"`,
      };
    }
  }

  return { valid: true, message: "CSS selector criteria satisfied" };
}
