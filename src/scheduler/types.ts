/**
 * Scheduled monitor job
 */
export interface ScheduledJob {
  id: string; // namespace/name
  namespace: string;
  name: string;
  nextRunAt: Date;
  intervalSeconds: number;
  timeoutSeconds: number;
  priority: number; // lower = higher priority (for heap)
}

/**
 * Check execution request
 */
export interface CheckRequest {
  jobId: string;
  namespace: string;
  name: string;
  monitorType: string;
  timeout: number;
}

/**
 * Scheduler state
 */
export interface SchedulerState {
  running: boolean;
  isPrimary: boolean;
  jobs: Map<string, ScheduledJob>;
}

/**
 * Check result handler
 */
export type CheckResultHandler = (
  jobId: string,
  state: "up" | "down" | "pending",
  latencyMs: number,
  reason: string,
  message: string,
) => Promise<void>;
