import { logger } from "../../lib/logger";
import {
  NotificationPolicySchema,
  NotificationProviderSchema,
} from "../../types/crd";
import type { CRDResource, ReconcilerConfig } from "./types";
import {
  commonValidations,
  composeValidators,
  createZodValidator,
  validate,
} from "./validation";

/**
 * NotificationProvider validators
 */
const validateProviderConfig = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  const hasConfig =
    spec.config?.slack ||
    spec.config?.discord ||
    spec.config?.telegram ||
    spec.config?.smtp ||
    spec.config?.webhook ||
    spec.config?.gotify ||
    spec.config?.pushover ||
    spec.config?.apprise;

  if (!hasConfig) {
    errors.push("At least one provider config must be specified");
  }

  return errors;
};

const validateProvider = composeValidators(
  commonValidations.validateName,
  commonValidations.validateSpec,
  createZodValidator(NotificationProviderSchema),
  validateProviderConfig,
);

const reconcileNotificationProvider = async (resource: CRDResource) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const type = resource.spec.type;

  logger.debug({ namespace, name, type }, "Reconciling NotificationProvider");

  try {
    // Test provider connectivity
    const { deliverNotification } = require("../../alerting/providers");
    const result = await deliverNotification(
      resource,
      "[Test] Yuptime Provider Test",
      "This is a test notification to verify provider connectivity.",
    );

    if (result.success) {
      logger.info({ namespace, name }, "Provider connectivity test passed");
    } else {
      logger.warn(
        { namespace, name, error: result.error },
        "Provider connectivity test failed",
      );
    }

    // Cache provider config in crd_cache for fast access
    const { crdCache } = require("../../db/schema");
    const db = require("../../db").getDatabase();
    const { eq, and } = require("drizzle-orm");

    await db
      .update(crdCache)
      .set({
        status: result.success ? "valid" : "invalid",
        lastReconcile: new Date().toISOString(),
      })
      .where(
        and(
          eq(crdCache.kind, "NotificationProvider"),
          eq(crdCache.namespace, namespace),
          eq(crdCache.name, name),
        ),
      );

    logger.debug(
      { namespace, name },
      "NotificationProvider reconciliation complete",
    );
  } catch (error) {
    logger.error(
      { namespace, name, error },
      "NotificationProvider reconciliation failed",
    );
    throw error;
  }
};

/**
 * NotificationPolicy validators
 */
const validatePolicyRouting = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  if (!spec.routing?.providers || spec.routing.providers.length === 0) {
    errors.push("spec.routing.providers must have at least one provider");
  }

  return errors;
};

const validatePolicy = composeValidators(
  commonValidations.validateName,
  commonValidations.validateSpec,
  createZodValidator(NotificationPolicySchema),
  validatePolicyRouting,
);

const reconcileNotificationPolicy = async (resource: CRDResource) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;

  logger.debug({ namespace, name }, "Reconciling NotificationPolicy");

  try {
    // Build routing table from selectors and providers
    const { findMatchingPolicies } = require("../../alerting/policy-matcher");

    // Validate that all referenced providers exist
    const spec = resource.spec;
    const { crdCache } = require("../../db/schema");
    const db = require("../../db").getDatabase();
    const { eq } = require("drizzle-orm");

    for (const provider of spec.routing?.providers || []) {
      const [exists] = await db
        .select()
        .from(crdCache)
        .where(eq(crdCache.kind, "NotificationProvider"))
        .limit(1);

      if (!exists) {
        logger.warn(
          { namespace, name, provider: provider.ref.name },
          "Referenced provider not found",
        );
      }
    }

    // Cache routing rules by testing against all monitors
    const monitors = await db
      .select()
      .from(crdCache)
      .where(eq(crdCache.kind, "Monitor"));

    let matchCount = 0;
    for (const monitor of monitors) {
      const monitorSpec = JSON.parse(monitor.spec || "{}");
      const matched = await findMatchingPolicies(
        monitor.namespace,
        monitor.name,
        monitorSpec.metadata?.labels,
      );

      if (matched.some((p) => p.name === name)) {
        matchCount++;
      }
    }

    logger.info(
      { namespace, name, matchingMonitors: matchCount },
      "NotificationPolicy reconciliation complete",
    );
  } catch (error) {
    logger.error(
      { namespace, name, error },
      "NotificationPolicy reconciliation failed",
    );
    throw error;
  }
};

export const createNotificationProviderReconciler = (): ReconcilerConfig => ({
  kind: "NotificationProvider",
  plural: "notificationproviders",
  zodSchema: NotificationProviderSchema,
  validator: validate(validateProvider),
  reconciler: reconcileNotificationProvider,
});

export const createNotificationPolicyReconciler = (): ReconcilerConfig => ({
  kind: "NotificationPolicy",
  plural: "notificationpolicies",
  zodSchema: NotificationPolicySchema,
  validator: validate(validatePolicy),
  reconciler: reconcileNotificationPolicy,
});
