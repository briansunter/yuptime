import type { Monitor } from "../types/crd";

export interface CheckEngineSnapshot {
  running: boolean;
  registeredMonitors: number;
  queueDepth: number;
  inFlight: number;
  overdueMonitors: number;
  lastTickAt?: string;
  runnerReady: boolean;
  oldestQueuedMs: number;
}

export interface CheckEngine {
  start(): Promise<void>;
  upsert(monitor: Monitor): void;
  remove(monitorId: string): void;
  snapshot(): CheckEngineSnapshot;
  stop(graceMs: number): Promise<void>;
}
