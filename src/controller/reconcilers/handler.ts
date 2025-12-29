import { logger } from "../../lib/logger";
import { markInvalid, markValid } from "./status-utils";
import type { ReconcileContext, TypeSafeReconciler } from "./types";

/**
 * Type-safe reconciliation handler for CRD resources
 *
 * This handler:
 * 1. Parses the resource with Zod (runtime validation + type safety)
 * 2. Runs the validator function (receives fully typed resource)
 * 3. Executes the reconciler (receives fully typed resource)
 * 4. Updates status based on result
 *
 * @template T - The CRD type (e.g., Monitor, Incident)
 * @param config - Type-safe reconciler configuration with Zod schema
 * @param additionalContext - Optional context to merge
 * @param statusUpdater - Status update functions (default: markValid/markInvalid)
 * @returns Handler function compatible with informers (accepts unknown from K8s API)
 *
 * @example
 * const monitorHandler = createTypeSafeReconciliationHandler(
 *   createTypeSafeReconciler<Monitor>(
 *     'Monitor',
 *     'monitors',
 *     MonitorSchema,
 *     {
 *       validator: validateMonitor,
 *       reconciler: reconcileMonitor,
 *     }
 *   ),
 *   { jobManager }
 * );
 *
 * // Register with informers
 * registry.registerReconciler('Monitor', monitorHandler);
 */
export function createTypeSafeReconciliationHandler<T extends object>(
  config: TypeSafeReconciler<T>,
  additionalContext?: Partial<ReconcileContext>,
  statusUpdater = { markValid, markInvalid },
): (resource: unknown) => Promise<void> {
  return async (resource: unknown) => {
    // Merge contexts: default + additional + runtime
    const ctx: ReconcileContext = {
      crdWatcher: null,
      statusUpdater,
      secretResolver: async () => "",
      ...additionalContext,
    };

    let namespace: string;
    let name: string;
    let generation: number;

    try {
      // Step 1: Parse and validate with Zod (throws on failure)
      const typedResource = config.zodSchema.parse(resource);

      // Extract metadata for logging (using unknown cast for safety)
      namespace =
        (typedResource as unknown as { metadata: { namespace?: string } })
          .metadata?.namespace || "";
      name = (typedResource as unknown as { metadata: { name: string } })
        .metadata.name;
      generation =
        (typedResource as unknown as { metadata: { generation?: number } })
          .metadata?.generation || 0;

      // Step 2: Run validator (receives fully typed resource)
      const validationResult = await Promise.resolve(
        config.validator(typedResource),
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

      // Step 3: Execute reconciler (receives fully typed resource)
      await config.reconciler(typedResource, ctx);

      // Step 4: Mark as valid and reconciled
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
      // Extract metadata for error reporting (resource might not have been parsed)
      const metadata =
        typeof resource === "object" && resource !== null
          ? (resource as Record<string, unknown>).metadata
          : null;
      namespace =
        ((metadata as Record<string, unknown>)?.namespace as string) || "";
      name =
        ((metadata as Record<string, unknown>)?.name as string) || "unknown";

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
}

/**
 * Type-safe delete handler factory
 */
export function createTypeSafeDeleteHandler<T extends object>(
  config: TypeSafeReconciler<T>,
): (namespace: string, name: string) => Promise<void> {
  return async (namespace: string, name: string) => {
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
}
