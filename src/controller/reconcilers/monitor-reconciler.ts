import { logger } from "../../lib/logger";
import { resetMonitorMetrics } from "../../lib/prometheus";
import type { Monitor } from "../../types/crd";
import { MonitorSchema } from "../../types/crd";
import type { ReconcileContext } from "./types";
import { createTypeSafeReconciler } from "./types";
import { typedCommonValidations, typedComposeValidators, typedValidate } from "./validation";

/**
 * Monitor-specific validators
 */
const validateMonitorSchedule = (resource: Monitor): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  if (!spec.schedule) return errors;

  if (spec.schedule.timeoutSeconds >= spec.schedule.intervalSeconds) {
    errors.push("schedule.timeoutSeconds must be less than schedule.intervalSeconds");
  }

  if (spec.schedule.intervalSeconds < 20) {
    errors.push("schedule.intervalSeconds must be at least 20 seconds");
  }

  return errors;
};

type Target = NonNullable<Monitor["spec"]["target"]>;

const TARGET_REQUIREMENTS: Partial<Record<Monitor["spec"]["type"], (target: Target) => boolean>> = {
  http: (t) => Boolean(t.http),
  keyword: (t) => Boolean(t.http),
  jsonQuery: (t) => Boolean(t.http),
  xmlQuery: (t) => Boolean(t.http),
  htmlQuery: (t) => Boolean(t.http),
  tcp: (t) => Boolean(t.tcp),
  dns: (t) => Boolean(t.dns),
  ping: (t) => Boolean(t.ping),
  websocket: (t) => Boolean(t.websocket),
  push: (t) => Boolean(t.push),
  steam: (t) => Boolean(t.steam),
  k8s: (t) => Boolean(t.k8s || t.kubernetes),
  mysql: (t) => Boolean(t.mysql),
  postgresql: (t) => Boolean(t.postgresql),
  redis: (t) => Boolean(t.redis),
  grpc: (t) => Boolean(t.grpc),
};

const TARGET_REQUIREMENT_MESSAGE: Partial<Record<Monitor["spec"]["type"], string>> = {
  http: "Monitor type http requires http target",
  keyword: "Monitor type keyword requires http target",
  jsonQuery: "Monitor type jsonQuery requires http target",
  xmlQuery: "Monitor type xmlQuery requires http target",
  htmlQuery: "Monitor type htmlQuery requires http target",
  tcp: "Monitor type tcp requires tcp target",
  dns: "Monitor type dns requires dns target",
  ping: "Monitor type ping requires ping target",
  websocket: "Monitor type websocket requires websocket target",
  push: "Monitor type push requires push target",
  steam: "Monitor type steam requires steam target",
  k8s: "Monitor type k8s requires k8s or kubernetes target",
  mysql: "Monitor type mysql requires mysql target",
  postgresql: "Monitor type postgresql requires postgresql target",
  redis: "Monitor type redis requires redis target",
  grpc: "Monitor type grpc requires grpc target",
};

function hasAnyTarget(target: Target | undefined): boolean {
  if (!target) return false;
  return Boolean(
    target.http ||
      target.tcp ||
      target.dns ||
      target.ping ||
      target.websocket ||
      target.push ||
      target.steam ||
      target.k8s ||
      target.kubernetes ||
      target.mysql ||
      target.postgresql ||
      target.redis ||
      target.grpc,
  );
}

const validateMonitorTarget = (resource: Monitor): string[] => {
  const errors: string[] = [];
  const spec = resource.spec;

  if (!hasAnyTarget(spec.target)) {
    errors.push("At least one target must be configured");
  }

  const requirement = TARGET_REQUIREMENTS[spec.type];
  if (requirement && spec.target && !requirement(spec.target)) {
    const message = TARGET_REQUIREMENT_MESSAGE[spec.type];
    if (message) errors.push(message);
  }

  return errors;
};

/**
 * Monitor validator - composed from multiple validators
 */
const validateMonitor = typedComposeValidators(
  typedCommonValidations.validateName,
  typedCommonValidations.validateSpec,
  validateMonitorSchedule,
  validateMonitorTarget,
);

/**
 * Monitor reconciliation logic
 */
const reconcileMonitor = (resource: Monitor, ctx: ReconcileContext): Promise<void> => {
  const namespace = resource.metadata.namespace || "";
  const name = resource.metadata.name;
  const spec = resource.spec;

  logger.debug({ namespace, name, type: spec.type }, "Reconciling Monitor");

  const checkEngine = ctx?.checkEngine;
  if (!checkEngine) {
    logger.error({ namespace, name }, "CheckEngine not available in reconciliation context");
    return Promise.resolve();
  }
  const id = `${namespace}/${name}`;
  if (spec.enabled === false) {
    checkEngine.remove(id);
    logger.info({ namespace, name }, "Monitor removed from Check Engine (disabled)");
  } else {
    checkEngine.upsert(resource);
  }

  logger.debug({ namespace, name }, "Monitor reconciliation complete");
  return Promise.resolve();
};

/**
 * Handle monitor deletion
 */
export const handleMonitorDeletion = (
  namespace: string,
  name: string,
  ctx?: ReconcileContext,
): Promise<void> => {
  const monitorId = `${namespace}/${name}`;
  ctx?.checkEngine?.remove(monitorId);

  // Drop Prometheus gauge/histogram series so deleted monitors don't leak.
  resetMonitorMetrics(name, namespace);

  logger.debug({ namespace, name }, "Monitor deleted, removed from tracker");
  return Promise.resolve();
};

/**
 * Stop the safety-net interval and clear all tracking state.
 * Call during controller shutdown to prevent timer leaks.
 */
export function stopSafetyNet() {
  // Kept as a compatibility export while callers migrate to CheckEngine.stop().
}

/**
 * Factory function to create type-safe monitor reconciler
 */
export const createMonitorReconciler = () =>
  createTypeSafeReconciler<Monitor>(
    "Monitor",
    "monitors",
    MonitorSchema as unknown as import("zod").ZodSchema<Monitor>,
    {
      validator: typedValidate(validateMonitor),
      reconciler: reconcileMonitor,
      deleteHandler: handleMonitorDeletion,
    },
  );
