import type { CheckResult } from "../checkers";
import type { Monitor } from "../types/crd";

export interface AttemptRequest {
  protocolVersion: 1;
  executionId: string;
  monitor: Monitor;
  attempt: number;
  scheduledAt: string;
  deadline: string;
}

export interface AttemptResult extends CheckResult {
  executionId: string;
  attempt: number;
  startedAt: string;
  checkedAt: string;
}

export interface CheckRunner {
  runAttempt(request: AttemptRequest, signal: AbortSignal): Promise<AttemptResult>;
  ready(): Promise<boolean>;
  shutdown(graceMs: number): Promise<void>;
}

export class RunnerUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RunnerUnavailableError";
  }
}
