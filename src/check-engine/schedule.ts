import type { Monitor } from "../types/crd";

export interface SlotSequence {
  anchorMs: number;
  intervalMs: number;
  phaseMs: number;
  firstSlotMs: number;
}

export function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function slotSequence(monitor: Monitor, observedAtMs: number): SlotSequence {
  const schedule = monitor.spec.schedule;
  const intervalMs = schedule.intervalSeconds * 1000;
  const createdAt = monitor.metadata.creationTimestamp
    ? Date.parse(monitor.metadata.creationTimestamp)
    : observedAtMs;
  const anchorMs = createdAt + (schedule.initialDelaySeconds ?? 0) * 1000;
  const jitterWindowMs = intervalMs * ((schedule.jitterPercent ?? 5) / 100);
  const identity = `${monitor.metadata.namespace}/${monitor.metadata.name}/${monitor.metadata.uid ?? ""}`;
  const phaseMs = jitterWindowMs === 0 ? 0 : stableHash(identity) % Math.max(1, jitterWindowMs);

  return { anchorMs, intervalMs, phaseMs, firstSlotMs: anchorMs + phaseMs };
}

export function firstSlotAfter(sequence: SlotSequence, timestampMs: number): number {
  if (timestampMs < sequence.firstSlotMs) return sequence.firstSlotMs;
  const periods = Math.floor((timestampMs - sequence.firstSlotMs) / sequence.intervalMs) + 1;
  return sequence.firstSlotMs + periods * sequence.intervalMs;
}

export function latestSlotAtOrBefore(sequence: SlotSequence, timestampMs: number): number | null {
  if (timestampMs < sequence.firstSlotMs) return null;
  const periods = Math.floor((timestampMs - sequence.firstSlotMs) / sequence.intervalMs);
  return sequence.firstSlotMs + periods * sequence.intervalMs;
}
