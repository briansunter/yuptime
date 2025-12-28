import { logger } from "../../lib/logger";
import { markInvalid, markValid } from "./status-utils";
import type { CRDResource, ReconcileContext, ReconcilerConfig } from "./types";

/**
 * Generic reconciliation handler that handles any CRD type
 * - Validates the resource
 * - Executes reconciliation logic
 * - Updates status accordingly
 */
export const createReconciliationHandler =
  (
    config: ReconcilerConfig,
    additionalContext?: Partial<ReconcileContext>,
    statusUpdater = { markValid, markInvalid },
  ) =>
  async (resource: CRDResource, context?: ReconcileContext) => {
    // Merge contexts: default + additional + runtime
    const ctx: ReconcileContext = {
      crdWatcher: null,
      statusUpdater,
      secretResolver: async () => "",
      ...additionalContext,
      ...context,
    };
    const namespace = resource.metadata?.namespace || "";
    const name = resource.metadata.name;
    const generation = resource.metadata?.generation || 0;

    try {
      // Validate resource (may be sync or async)
      const validationResult = await Promise.resolve(
        config.validator(resource),
      );

      if (!validationResult.valid) {
        const message =
          validationResult.errors?.join("; ") || "Validation failed";
        logger.warn(
          { kind: config.kind, namespace, name },
          `Validation failed: ${message}`,
        );

        await statusUpdater.markInvalid(
          config.kind,
          config.plural,
          namespace,
          name,
          "ValidationFailed",
          message,
        );

        return;
      }

      // Execute reconciliation
      await config.reconciler(resource, ctx);

      // Mark as valid and reconciled
      await statusUpdater.markValid(
        config.kind,
        config.plural,
        namespace,
        name,
        generation,
      );

      logger.debug(
        { kind: config.kind, namespace, name },
        `${config.kind} reconciliation successful`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        { kind: config.kind, namespace, name, error },
        `${config.kind} reconciliation failed`,
      );

      try {
        await statusUpdater.markInvalid(
          config.kind,
          config.plural,
          namespace,
          name,
          "ReconcileFailed",
          message,
        );
      } catch (statusError) {
        logger.error(
          { error: statusError },
          "Failed to update status after error",
        );
      }
    }
  };

/**
 * Factory for delete handlers
 */
export const createDeleteHandler =
  (config: ReconcilerConfig) => async (namespace: string, name: string) => {
    if (!config.deleteHandler) {
      logger.debug(
        { kind: config.kind, namespace, name },
        `No delete handler for ${config.kind}`,
      );
      return;
    }

    try {
      await config.deleteHandler(namespace, name);
      logger.debug(
        { kind: config.kind, namespace, name },
        `${config.kind} deleted successfully`,
      );
    } catch (error) {
      logger.error(
        { kind: config.kind, namespace, name, error },
        `Delete handler for ${config.kind} failed`,
      );
    }
  };
