import { performance } from "node:perf_hooks";
import { resolveSecretCached } from "../lib/secrets";
import type { SecretRef } from "../types/crd/common";

export interface CheckContext {
  signal: AbortSignal;
  resolveSecret(ref: SecretRef, defaultNamespace: string): Promise<string>;
  wallNow(): Date;
  monotonicNow(): number;
}

export function createCheckContext(
  signal: AbortSignal = new AbortController().signal,
): CheckContext {
  return {
    signal,
    resolveSecret: (ref, defaultNamespace) =>
      resolveSecretCached(ref.namespace ?? defaultNamespace, ref.name, ref.key),
    wallNow: () => new Date(),
    monotonicNow: () => performance.now(),
  };
}
