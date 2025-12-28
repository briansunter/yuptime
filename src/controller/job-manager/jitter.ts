/**
 * Deterministic jitter based on resource name hash
 * Ensures same resource always gets same jitter across restarts
 * Prevents thundering herd of checks at interval boundaries
 *
 * Migrated from src/scheduler/jitter.ts
 */

/**
 * Simple hash function for consistent jitter seed
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Calculate deterministic jitter for a monitor
 * Returns a stable jitter in milliseconds based on the monitor's identity
 */
export function calculateJitter(
  namespace: string,
  name: string,
  jitterPercent: number,
  intervalSeconds: number,
): number {
  if (jitterPercent === 0) return 0;

  const jitterMs = (intervalSeconds * 1000 * jitterPercent) / 100;
  const seed = hashString(`${namespace}/${name}`);
  const normalized = (seed % 10000) / 10000; // 0-1

  return Math.floor(normalized * jitterMs);
}

/**
 * Calculate the next scheduled run time with jitter
 */
export function calculateNextRunTime(
  intervalSeconds: number,
  jitterMs: number,
): Date {
  const nextRun = new Date();
  nextRun.setTime(nextRun.getTime() + intervalSeconds * 1000 + jitterMs);
  return nextRun;
}

/**
 * Calculate when a job should be rescheduled after execution
 */
export function rescheduleJob(
  currentTime: Date,
  intervalSeconds: number,
  jitterMs: number,
): Date {
  // Schedule for interval from now (not from scheduled time)
  // This prevents drift if execution takes time
  const nextRun = new Date(
    currentTime.getTime() + intervalSeconds * 1000 + jitterMs,
  );
  return nextRun;
}
