import type { ZodSchema } from "zod";
import type { JobManager } from "../job-manager";

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[] | undefined;
}

/**
 * Reconciliation context - passed to reconcilers
 */
export interface ReconcileContext {
  crdWatcher?: unknown;
  statusUpdater?: unknown;
  secretResolver?: (ns: string, name: string, key: string) => Promise<string>;
  jobManager?: JobManager | null;
}

/**
 * Type-safe reconciler configuration
 *
 * Generic reconciler that provides fully typed resources to the reconciler function.
 * No type assertions needed - Zod parses and validates before calling reconciler.
 *
 * @template T - The CRD type (e.g., Monitor, Incident, NotificationPolicy)
 */
export interface TypeSafeReconciler<T extends object> {
  kind: string;
  plural: string;
  zodSchema: ZodSchema<T>;
  validator: (resource: T) => ValidationResult | Promise<ValidationResult>;
  reconciler: (resource: T, ctx: ReconcileContext) => Promise<void>;
  deleteHandler?: (namespace: string, name: string) => Promise<void>;
}

/**
 * Create a type-safe reconciler configuration
 *
 * Factory function that creates a properly typed reconciler config.
 * The reconciler function will receive fully validated and typed resources.
 *
 * @template T - The CRD type
 * @param kind - CRD kind name
 * @param plural - CRD plural name
 * @param zodSchema - Zod schema for validation
 * @param config - Reconciler configuration (without kind/plural/schema)
 * @returns Type-safe reconciler configuration
 *
 * @example
 * export const createMonitorReconciler = (): TypeSafeReconciler<Monitor> =>
 *   createTypeSafeReconciler<Monitor>(
 *     'Monitor',
 *     'monitors',
 *     MonitorSchema,
 *     {
 *       validator: validate(validateMonitor),
 *       reconciler: reconcileMonitor,
 *       deleteHandler: handleMonitorDeletion,
 *     }
 *   );
 */
export function createTypeSafeReconciler<T extends object>(
  kind: string,
  plural: string,
  zodSchema: ZodSchema<T>,
  config: Omit<TypeSafeReconciler<T>, "kind" | "plural" | "zodSchema">,
): TypeSafeReconciler<T> {
  return {
    kind,
    plural,
    zodSchema,
    ...config,
  };
}

/**
 * Typed validator function
 */
export type TypedValidatorFn<T> = (resource: T) => ValidationResult | Promise<ValidationResult>;

/**
 * Typed reconciler function
 */
export type TypedReconcilerFn<T> = (resource: T, ctx: ReconcileContext) => Promise<void>;

/**
 * Base interface for resources with metadata
 * Used for common validations
 */
export interface ResourceWithMetadata {
  metadata: {
    name: string;
    namespace?: string | undefined;
    uid?: string | undefined;
    generation?: number | undefined;
    resourceVersion?: string | undefined;
    labels?: Record<string, string> | undefined;
    annotations?: Record<string, string> | undefined;
  };
  spec: unknown;
}
