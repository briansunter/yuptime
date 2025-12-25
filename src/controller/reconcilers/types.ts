import type { ZodSchema } from "zod";

/**
 * Generic CRD resource structure
 */
export interface CRDResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    generation?: number;
    resourceVersion?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: Record<string, any>;
  status?: Record<string, any>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Reconciliation context - passed to reconcilers
 */
export interface ReconcileContext {
  crdWatcher: any; // CRD watcher instance
  statusUpdater: any; // Status updater functions
  secretResolver: (ns: string, name: string, key: string) => Promise<string>;
}

/**
 * Validator function signature (can be sync or async)
 */
export type ValidatorFn = (
  resource: CRDResource,
) => ValidationResult | Promise<ValidationResult>;

/**
 * Reconciler function signature
 */
export type ReconcilerFn = (
  resource: CRDResource,
  ctx: ReconcileContext,
) => Promise<void>;

/**
 * Delete handler function signature
 */
export type DeleteHandlerFn = (
  namespace: string,
  name: string,
) => Promise<void>;

/**
 * Complete reconciler configuration
 */
export interface ReconcilerConfig {
  kind: string;
  plural: string;
  zodSchema: ZodSchema;
  validator: ValidatorFn;
  reconciler: ReconcilerFn;
  deleteHandler?: DeleteHandlerFn;
}
