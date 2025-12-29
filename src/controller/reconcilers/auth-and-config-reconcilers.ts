import { logger } from "../../lib/logger";
import type { Silence, YuptimeSettings } from "../../types/crd";
import { SilenceSchema, YuptimeSettingsSchema } from "../../types/crd";
import type { ReconcileContext } from "./types";
import { createTypeSafeReconciler } from "./types";
import {
  typedCommonValidations,
  typedComposeValidators,
  typedValidate,
  validateFutureDate,
} from "./validation";

/**
 * Silence validators
 */
const validateSilenceExpiry = (resource: Silence): string[] => {
  const expiresAt = resource.spec.expiresAt;
  return validateFutureDate(expiresAt, "spec.expiresAt");
};

const validateSilence = typedComposeValidators(
  typedCommonValidations.validateName,
  typedCommonValidations.validateSpec,
  validateSilenceExpiry,
);

const silenceCache = new Map<
  string,
  {
    namespace: string;
    name: string;
    expiresAt: Date;
    match: {
      names?: Array<{ namespace: string; name: string }> | undefined;
      namespaces?: string[] | undefined;
      labels?: Record<string, string> | undefined;
      tags?: string[] | undefined;
    };
    reason?: string | undefined;
  }
>();

const reconcileSilence = async (resource: Silence, _ctx: ReconcileContext) => {
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
      expiresAt: new Date(spec.expiresAt),
      match: spec.match,
      reason: spec.reason,
    };

    silenceCache.set(silenceKey, silenceData);

    // Calculate expiry time
    const endsAt = new Date(spec.expiresAt);
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
        "Silence cached with expiry timer",
      );
    } else {
      // Silence already expired, don't cache it
      logger.warn({ namespace, name }, "Silence already expired, not caching");
      silenceCache.delete(silenceKey);
    }

    logger.debug({ namespace, name }, "Silence reconciliation complete");
  } catch (error) {
    logger.error({ namespace, name, error }, "Silence reconciliation failed");
    throw error;
  }
};

/**
 * Get all active silences that match given labels
 */
export const getActiveSilences = (
  labels: Record<string, string> = {},
): Array<{
  namespace: string;
  name: string;
  expiresAt: Date;
  match: {
    names?: Array<{ namespace: string; name: string }>;
    namespaces?: string[];
    labels?: Record<string, string>;
    tags?: string[];
  };
  reason?: string;
}> => {
  const now = new Date();
  const matchingSilences: Array<{
    namespace: string;
    name: string;
    expiresAt: Date;
    match: {
      names?: Array<{ namespace: string; name: string }>;
      namespaces?: string[];
      labels?: Record<string, string>;
      tags?: string[];
    };
    reason?: string;
  }> = [];

  for (const silence of silenceCache.values()) {
    // Check if silence is currently active (before expiry time)
    if (now <= silence.expiresAt) {
      // Check if match matches the labels
      const match = silence.match;
      let matches = true;

      if (match?.names && match.names.length > 0) {
        // Check name-based matching
        // This would require namespace/name context
        // For now, continue if names are specified
        continue;
      }

      if (match?.namespaces && match.namespaces.length > 0) {
        // Would need namespace context
        continue;
      }

      if (match?.labels) {
        // Check label matching
        for (const [key, expectedValue] of Object.entries(match.labels)) {
          if (labels[key] !== expectedValue) {
            matches = false;
            break;
          }
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
 * Settings validators
 */
const validateSettingsName = (resource: YuptimeSettings): string[] => {
  if (resource.metadata.name !== "yuptime") {
    return ["metadata.name must be exactly 'yuptime' (only one instance allowed)"];
  }
  return [];
};

const validateSettingsScheduler = (resource: YuptimeSettings): string[] => {
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

const validateSettings = typedComposeValidators(
  typedCommonValidations.validateSpec,
  validateSettingsName,
  validateSettingsScheduler,
);

type GlobalSettings = {
  mode?:
    | {
        gitOpsReadOnly?: boolean | undefined;
        singleInstanceRequired?: boolean | undefined;
      }
    | undefined;
  scheduler?:
    | {
        minIntervalSeconds?: number | undefined;
        maxConcurrentNetChecks?: number | undefined;
        maxConcurrentPrivChecks?: number | undefined;
      }
    | undefined;
  networking?:
    | {
        userAgent?: string | undefined;
      }
    | undefined;
};

let globalSettings: GlobalSettings | null = null;

const reconcileSettings = async (resource: YuptimeSettings, _ctx: ReconcileContext) => {
  const name = resource.metadata.name;

  logger.info({ name }, "Reconciling YuptimeSettings");

  // Update global settings
  globalSettings = resource.spec;

  logger.info(
    {
      gitOpsReadOnly: resource.spec.mode?.gitOpsReadOnly,
      minInterval: resource.spec.scheduler?.minIntervalSeconds,
    },
    "YuptimeSettings updated",
  );
};

/**
 * Get current global settings
 */
export const getGlobalSettings = () => {
  if (!globalSettings) {
    logger.warn("YuptimeSettings not yet loaded, using defaults");
    return {
      mode: { gitOpsReadOnly: false, singleInstanceRequired: true },
      scheduler: {
        minIntervalSeconds: 20,
        maxConcurrentNetChecks: 200,
        maxConcurrentPrivChecks: 20,
      },
      networking: { userAgent: "Yuptime/1.0" },
    };
  }
  return globalSettings;
};

export const createSilenceReconciler = () =>
  createTypeSafeReconciler<Silence>(
    "Silence",
    "silences",
    SilenceSchema as unknown as import("zod").ZodSchema<Silence>,
    {
      validator: typedValidate(validateSilence),
      reconciler: reconcileSilence,
    },
  );

export const createSettingsReconciler = () =>
  createTypeSafeReconciler<YuptimeSettings>(
    "YuptimeSettings",
    "yuptimesettings",
    YuptimeSettingsSchema as unknown as import("zod").ZodSchema<YuptimeSettings>,
    {
      validator: typedValidate(validateSettings),
      reconciler: reconcileSettings,
    },
  );
