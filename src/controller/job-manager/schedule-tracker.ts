/**
 * Schedule Tracker
 *
 * Shared module tracking when each monitor was last successfully scheduled.
 * Both reconciler and completion-watcher write to it; safety-net reads from it.
 */

const lastScheduleTime = new Map<string, number>();

export function recordSchedule(monitorId: string): void {
  lastScheduleTime.set(monitorId, Date.now());
}

export function getLastScheduleTime(monitorId: string): number {
  return lastScheduleTime.get(monitorId) || 0;
}

export function isOverdue(monitorId: string, intervalMs: number, multiplier = 2): boolean {
  const lastTime = lastScheduleTime.get(monitorId) || 0;
  if (lastTime === 0) return true;
  const elapsed = Date.now() - lastTime;
  return elapsed > intervalMs * multiplier;
}

export function removeMonitor(monitorId: string): void {
  lastScheduleTime.delete(monitorId);
}

export function getAllTracked(): ReadonlyMap<string, number> {
  return lastScheduleTime;
}

export function clearAll(): void {
  lastScheduleTime.clear();
}
