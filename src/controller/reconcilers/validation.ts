import type { ResourceWithMetadata, TypedValidatorFn, ValidationResult } from "./types";

/**
 * Common validation checks
 */
export const commonValidations = {
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

    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start >= end) {
      errors.push(`${startPath} must be before ${endPath}`);
    }

    return errors;
  },
};

/**
 * Type-safe common validators
 */
export const typedCommonValidations = {
  /**
   * Validate metadata.name exists and is valid
   */
  validateName: <T extends ResourceWithMetadata>(resource: T): string[] => {
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
  validateSpec: <T extends { spec?: unknown }>(resource: T): string[] => {
    if (!resource.spec) {
      return ["spec is required"];
    }
    return [];
  },
};

/**
 * Type-safe validator composition
 */
export const typedComposeValidators =
  <T>(...validators: ((resource: T) => string[])[]): ((resource: T) => string[]) =>
  (resource: T) => {
    const allErrors: string[] = [];

    for (const validator of validators) {
      const errors = validator(resource);
      allErrors.push(...errors);
    }

    return allErrors;
  };

/**
 * Type-safe validation wrapper
 */
export const typedValidate =
  <T>(validator: (resource: T) => string[]): TypedValidatorFn<T> =>
  (resource: T): ValidationResult => {
    const errors = validator(resource);
    const result: ValidationResult = {
      valid: errors.length === 0,
    };
    if (errors.length > 0) {
      result.errors = errors;
    }
    return result;
  };

/**
 * Validate uniqueness in array field
 */
export const validateUniqueField = <T>(
  fieldPath: string,
  items: T[],
  keySelector: (item: T) => string,
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
export const validateNonEmptyArray = <T>(fieldPath: string, items: T[]): string[] => {
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
