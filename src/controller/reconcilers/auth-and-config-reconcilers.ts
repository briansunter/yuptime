import { logger } from "../../lib/logger";
import { SilenceSchema, LocalUserSchema, ApiKeySchema, KubeKumaSettingsSchema } from "../../types/crd";
import type { ReconcilerConfig, CRDResource } from "./types";
import {
  commonValidations,
  createZodValidator,
  composeValidators,
  validate,
  validateFutureDate,
} from "./validation";

/**
 * Silence validators
 */
const validateSilenceExpiry = (resource: CRDResource): string[] => {
  const expiresAt = resource.spec.expiresAt;
  return validateFutureDate(expiresAt, "spec.expiresAt");
};

const validateSilence = composeValidators(
  commonValidations.validateName,
  commonValidations.validateSpec,
  createZodValidator(SilenceSchema),
  validateSilenceExpiry
);

const silenceCache = new Map<string, any>();

const reconcileSilence = async (resource: CRDResource) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const spec = resource.spec;

  logger.debug({ namespace, name }, "Reconciling Silence");

  try {
    // Cache silence rules
    const silenceKey = `${namespace}/${name}`;
    const silenceData = {
      namespace,
      name,
      startsAt: new Date(spec.startsAt),
      endsAt: new Date(spec.expiresAt || spec.endsAt),
      matchers: spec.matchers || [],
      comment: spec.comment,
    };

    silenceCache.set(silenceKey, silenceData);

    // Calculate expiry time
    const endsAt = new Date(spec.expiresAt || spec.endsAt);
    const now = new Date();
    const expiresInMs = endsAt.getTime() - now.getTime();

    if (expiresInMs > 0) {
      // Setup expiry timer to remove from cache when silence expires
      setTimeout(() => {
        silenceCache.delete(silenceKey);
        logger.info({ namespace, name }, "Silence expired and removed from cache");
      }, expiresInMs);

      logger.debug(
        { namespace, name, expiresIn: Math.floor(expiresInMs / 1000) },
        "Silence cached with expiry timer"
      );
    } else {
      // Silence already expired, don't cache it
      logger.warn({ namespace, name }, "Silence already expired, not caching");
      silenceCache.delete(silenceKey);
    }

    // Update crd_cache status
    const { crdCache } = require("../../db/schema");
    const db = require("../../db").getDatabase();
    const { eq, and } = require("drizzle-orm");

    await db
      .update(crdCache)
      .set({
        lastReconcile: new Date().toISOString(),
      })
      .where(
        and(
          eq(crdCache.kind, "Silence"),
          eq(crdCache.namespace, namespace),
          eq(crdCache.name, name)
        )
      );

    logger.debug({ namespace, name }, "Silence reconciliation complete");
  } catch (error) {
    logger.error({ namespace, name, error }, "Silence reconciliation failed");
    throw error;
  }
};

/**
 * Get all active silences that match given labels
 */
export const getActiveSilences = (labels: Record<string, string> = {}): any[] => {
  const now = new Date();
  const matchingSilences: any[] = [];

  for (const silence of silenceCache.values()) {
    // Check if silence is currently active
    if (silence.startsAt <= now && now <= silence.endsAt) {
      // Check if matchers match the labels
      let matches = true;
      for (const matcher of silence.matchers) {
        if (matcher.name && labels[matcher.name] !== matcher.value) {
          matches = false;
          break;
        }
      }

      if (matches) {
        matchingSilences.push(silence);
      }
    }
  }

  return matchingSilences;
};

/**
 * LocalUser validators
 */
const validateLocalUserName = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const username = resource.spec.username;

  if (!username || !/^[a-zA-Z0-9_-]{3,}$/.test(username)) {
    errors.push("spec.username must be 3+ alphanumeric characters");
  }

  return errors;
};

const validateLocalUser = composeValidators(
  commonValidations.validateName,
  commonValidations.validateSpec,
  createZodValidator(LocalUserSchema),
  validateLocalUserName
);

const reconcileLocalUser = async (resource: CRDResource) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const username = resource.spec.username;

  logger.debug({ namespace, name, username }, "Reconciling LocalUser");

  // TODO: Verify password hash secret
  // TODO: Cache user credentials
  // TODO: Setup MFA if enabled

  logger.debug({ namespace, name }, "LocalUser reconciliation complete");
};

/**
 * ApiKey validators
 */
const validateApiKeyExpiry = (resource: CRDResource): string[] => {
  if (!resource.spec.expiresAt) return [];
  return validateFutureDate(resource.spec.expiresAt, "spec.expiresAt");
};

const validateApiKey = composeValidators(
  commonValidations.validateName,
  commonValidations.validateSpec,
  createZodValidator(ApiKeySchema),
  validateApiKeyExpiry
);

const reconcileApiKey = async (resource: CRDResource) => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const owner = resource.spec.ownerRef?.name;

  logger.debug({ namespace, name, owner }, "Reconciling ApiKey");

  // TODO: Verify key hash secret
  // TODO: Cache API key
  // TODO: Setup expiry timer if needed

  logger.debug({ namespace, name }, "ApiKey reconciliation complete");
};

/**
 * Settings validators
 */
const validateSettingsName = (resource: CRDResource): string[] => {
  if (resource.metadata.name !== "kubekuma") {
    return ["metadata.name must be exactly 'kubekuma' (only one instance allowed)"];
  }
  return [];
};

const validateSettingsAuth = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  if (spec.auth?.mode === "oidc" && !spec.auth.oidc) {
    errors.push("OIDC configuration required when auth.mode=oidc");
  }

  if (spec.auth?.mode === "local" && !spec.auth.local) {
    errors.push("Local configuration required when auth.mode=local");
  }

  return errors;
};

const validateSettingsScheduler = (resource: CRDResource): string[] => {
  const errors: string[] = [];
  const scheduler = resource.spec.scheduler;

  if (scheduler?.minIntervalSeconds && scheduler.minIntervalSeconds < 1) {
    errors.push("scheduler.minIntervalSeconds must be >= 1");
  }

  if (scheduler?.maxConcurrentNetChecks && scheduler.maxConcurrentNetChecks < 1) {
    errors.push("scheduler.maxConcurrentNetChecks must be >= 1");
  }

  return errors;
};

const validateSettings = composeValidators(
  commonValidations.validateSpec,
  createZodValidator(KubeKumaSettingsSchema),
  validateSettingsName,
  validateSettingsAuth,
  validateSettingsScheduler
);

let globalSettings: any = null;

const reconcileSettings = async (resource: CRDResource) => {
  const name = resource.metadata.name;

  logger.info({ name }, "Reconciling KubeKumaSettings");

  // Update global settings
  globalSettings = resource.spec;

  logger.info(
    {
      authMode: resource.spec.auth?.mode,
      gitOpsReadOnly: resource.spec.mode?.gitOpsReadOnly,
      minInterval: resource.spec.scheduler?.minIntervalSeconds,
    },
    "KubeKumaSettings updated"
  );
};

/**
 * Get current global settings
 */
export const getGlobalSettings = () => {
  if (!globalSettings) {
    logger.warn("KubeKumaSettings not yet loaded, using defaults");
    return {
      mode: { gitOpsReadOnly: false, singleInstanceRequired: true },
      auth: { mode: "local" },
      scheduler: {
        minIntervalSeconds: 20,
        maxConcurrentNetChecks: 200,
        maxConcurrentPrivChecks: 20,
      },
    };
  }
  return globalSettings;
};

export const createSilenceReconciler = (): ReconcilerConfig => ({
  kind: "Silence",
  plural: "silences",
  zodSchema: SilenceSchema,
  validator: validate(validateSilence),
  reconciler: reconcileSilence,
});

export const createLocalUserReconciler = (): ReconcilerConfig => ({
  kind: "LocalUser",
  plural: "localusers",
  zodSchema: LocalUserSchema,
  validator: validate(validateLocalUser),
  reconciler: reconcileLocalUser,
});

export const createApiKeyReconciler = (): ReconcilerConfig => ({
  kind: "ApiKey",
  plural: "apikeys",
  zodSchema: ApiKeySchema,
  validator: validate(validateApiKey),
  reconciler: reconcileApiKey,
});

export const createSettingsReconciler = (): ReconcilerConfig => ({
  kind: "KubeKumaSettings",
  plural: "kubekumasettings",
  zodSchema: KubeKumaSettingsSchema,
  validator: validate(validateSettings),
  reconciler: reconcileSettings,
});
