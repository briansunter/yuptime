import { describe, expect, test } from "bun:test";
import { createHttpMonitor } from "../test-utils/fixtures/monitors";
import type { Monitor } from "../types/crd";
import { firstSlotAfter, slotSequence } from "./schedule";

function monitor(overrides: Partial<Monitor["metadata"]> = {}): Monitor {
  return {
    ...createHttpMonitor({ jitterPercent: 0 }),
    metadata: {
      name: "clock",
      namespace: "default",
      uid: "uid-clock",
      creationTimestamp: "2026-01-01T00:00:00.000Z",
      ...overrides,
    },
  } as Monitor;
}

describe("absolute schedule slots", () => {
  test("1,000 intervals remain exactly one interval apart", () => {
    const sequence = slotSequence(monitor(), 0);
    let slot = sequence.firstSlotMs;
    for (let index = 0; index < 1000; index++) {
      const next = firstSlotAfter(sequence, slot);
      expect(next - slot).toBe(60_000);
      slot = next;
    }
  });

  test("zero jitter is preserved and initial delay is part of the anchor", () => {
    const value = monitor();
    value.spec.schedule.initialDelaySeconds = 7;
    const sequence = slotSequence(value, 0);
    expect(sequence.phaseMs).toBe(0);
    expect(sequence.firstSlotMs).toBe(Date.parse("2026-01-01T00:00:07.000Z"));
  });

  test("stable jitter is a phase and is not accumulated", () => {
    const value = monitor();
    value.spec.schedule.jitterPercent = 10;
    const sequence = slotSequence(value, 0);
    const second = firstSlotAfter(sequence, sequence.firstSlotMs);
    const thousandth = sequence.firstSlotMs + 999 * sequence.intervalMs;
    expect(sequence.phaseMs).toBeGreaterThanOrEqual(0);
    expect(sequence.phaseMs).toBeLessThan(6_000);
    expect(second - sequence.firstSlotMs).toBe(60_000);
    expect(thousandth - sequence.firstSlotMs).toBe(999 * 60_000);
  });
});
