// Types and interfaces
export type { CRDResource, ValidationResult, ReconcileContext, ReconcilerConfig } from "./types";

// Validators and utilities
export {
  commonValidations,
  createZodValidator,
  composeValidators,
  validate,
  validateUniqueField,
  validateNonEmptyArray,
  validateRange,
} from "./validation";

// Status utilities
export { updateStatus, createCondition, updateConditions, markValid, markInvalid } from "./status-utils";

// Reconciler factories
export { createMonitorReconciler } from "./monitor-reconciler";
export { createMonitorSetReconciler } from "./monitor-set-reconciler";
export {
  createNotificationProviderReconciler,
  createNotificationPolicyReconciler,
} from "./notification-reconcilers";
export { createStatusPageReconciler } from "./status-page-reconciler";
export { createMaintenanceWindowReconciler } from "./maintenance-window-reconciler";
export {
  createSilenceReconciler,
  createLocalUserReconciler,
  createApiKeyReconciler,
  createSettingsReconciler,
  getGlobalSettings,
} from "./auth-and-config-reconcilers";

// Handler
export { createReconciliationHandler, createDeleteHandler } from "./handler";
