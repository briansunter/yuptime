import type { ZodSchema } from "zod";
import type { CRDResource, ValidationResult } from "./types";

/**
 * Common validation checks
 */
export const commonValidations = {
  /**
   * Validate metadata.name exists and is valid
   */
  validateName: (resource: CRDResource): string[] => {
    const errors: string[] = [];
    const name = resource.metadata?.name;

    if (!name) {
      errors.push("metadata.name is required");
      return errors;
    }

    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)) {
      errors.push("metadata.name must be a valid Kubernetes name");
    }

    return errors;
  },

  /**
   * Validate spec exists
   */
  validateSpec: (resource: CRDResource): string[] => {
    if (!resource.spec) {
      return ["spec is required"];
    }
    return [];
  },

  /**
   * Validate date field is in future
   */
  validateFutureDate: (dateStr: string, fieldPath: string): string[] => {
    const errors: string[] = [];
    const date = new Date(dateStr);

    if (Number.isNaN(date.getTime())) {
      errors.push(`${fieldPath} must be a valid ISO 8601 date`);
    } else if (date <= new Date()) {
      errors.push(`${fieldPath} must be in the future`);
    }

    return errors;
  },

  /**
   * Validate date range
   */
  validateDateRange: (
    startStr: string,
    endStr: string,
    startPath: string,
    endPath: string,
  ): string[] => {
    const errors: string[] = [];
    const start = new Date(startStr);
    const end = new Date(endStr);

    if (Number.isNaN(start.getTime())) {
      errors.push(`${startPath} must be a valid ISO 8601 date`);
    }

    if (Number.isNaN(end.getTime())) {
      errors.push(`${endPath} must be a valid ISO 8601 date`);
    }

    if (
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      start >= end
    ) {
      errors.push(`${startPath} must be before ${endPath}`);
    }

    return errors;
  },
};

/**
 * Create a Zod-based validator
 */
export const createZodValidator =
  (zodSchema: ZodSchema): ((resource: CRDResource) => string[]) =>
  (resource: CRDResource) => {
    const result = zodSchema.safeParse(resource);

    if (!result.success) {
      return result.error.issues.map((issue) => {
        return `${issue.path.join(".")}: ${issue.message}`;
      });
    }

    return [];
  };

/**
 * Compose multiple validators (AND logic)
 */
export const composeValidators =
  (
    ...validators: ((resource: CRDResource) => string[])[]
  ): ((resource: CRDResource) => string[]) =>
  (resource: CRDResource) => {
    const allErrors: string[] = [];

    for (const validator of validators) {
      const errors = validator(resource);
      allErrors.push(...errors);
    }

    return allErrors;
  };

/**
 * Run validation and return ValidationResult
 */
export const validate =
  (validator: (resource: CRDResource) => string[]) =>
  (resource: CRDResource): ValidationResult => {
    const errors = validator(resource);
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  };

/**
 * Validate uniqueness in array field
 */
export const validateUniqueField = (
  fieldPath: string,
  items: any[],
  keySelector: (item: any) => string,
): string[] => {
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const item of items) {
    const key = keySelector(item);
    if (seen.has(key)) {
      errors.push(`Duplicate value in ${fieldPath}: ${key}`);
    }
    seen.add(key);
  }

  return errors;
};

/**
 * Validate required array is not empty
 */
export const validateNonEmptyArray = (
  fieldPath: string,
  items: any[],
): string[] => {
  if (!items || items.length === 0) {
    return [`${fieldPath} must contain at least one item`];
  }
  return [];
};

/**
 * Validate numeric range
 */
export const validateRange = (
  value: number,
  min: number,
  max: number,
  fieldPath: string,
): string[] => {
  const errors: string[] = [];

  if (value < min) {
    errors.push(`${fieldPath} must be >= ${min}`);
  }

  if (value > max) {
    errors.push(`${fieldPath} must be <= ${max}`);
  }

  return errors;
};

/**
 * Exported directly for convenience
 */
export const validateDateRange = commonValidations.validateDateRange;
export const validateFutureDate = commonValidations.validateFutureDate;
export const validateName = commonValidations.validateName;
export const validateSpec = commonValidations.validateSpec;
