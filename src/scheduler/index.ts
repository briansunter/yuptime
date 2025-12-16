import { logger } from "../lib/logger";
import { getDatabase } from "../db";
import { executeCheck } from "../checkers";
import { handleAlertEvent } from "../alerting";
import { createPriorityQueue, type PriorityQueue } from "./queue";
import { calculateJitter, rescheduleJob } from "./jitter";
import { acquireLock, releaseLock, startLockRenewal, stopLockRenewal, } from "./lock";
import type { SchedulerState, ScheduledJob, } from "./types";
import type { AlertEvent } from "../alerting";

/**
 * Scheduler state management
 */
const createSchedulerState = (): SchedulerState => ({
  running: false,
  isPrimary: false,
  jobs: new Map(),
});

/**
 * Scheduler implementation using functional composition
 */
interface Scheduler {
  register(job: ScheduledJob): void;
  unregister(jobId: string): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getJobCount(): number;
}

/**
 * Create scheduler instance
 */
export function createScheduler(): Scheduler {
  const state = createSchedulerState();
  let queue: PriorityQueue | null = null;
  let schedulerLoop: NodeJS.Timer | null = null;

  const registerJob = (job: ScheduledJob) => {
    state.jobs.set(job.id, job);
    if (queue) {
      queue.add(job);
    }
  };

  const unregisterJob = (jobId: string) => {
    state.jobs.delete(jobId);
    if (queue) {
      queue.remove(jobId);
    }
  };

  const processNextJob = async () => {
    if (!queue || queue.isEmpty()) return;

    const nextJob = queue.peek();
    if (!nextJob) return;

    const now = new Date();
    if (nextJob.nextRunAt.getTime() > now.getTime()) {
      // Not ready yet
      return;
    }

    // Pop the job
    const job = queue.pop();
    if (!job) return;

    // Execute check
    await executeCheckAndHandleResult(job);

    // Reschedule
    const jitterMs = calculateJitter(
      job.namespace,
      job.name,
      5, // TODO: Get from settings
      job.intervalSeconds
    );
    job.nextRunAt = rescheduleJob(now, job.intervalSeconds, jitterMs);
    queue.add(job);
  };

  const executeCheckAndHandleResult = async (job: ScheduledJob) => {
    try {
      logger.debug({ jobId: job.id }, "Executing check");

      // Get the full monitor from cache
      const db = getDatabase();
      const { crdCache } = require("../db/schema");
      const { eq, and, desc: drizzleDesc } = require("drizzle-orm");

      const cached = await db
        .select()
        .from(crdCache)
        .where(
          and(
            eq(crdCache.kind, "Monitor"),
            eq(crdCache.namespace, job.namespace),
            eq(crdCache.name, job.name)
          )
        )
        .limit(1);

      if (!cached || cached.length === 0) {
        logger.warn({ jobId: job.id }, "Monitor not found in cache");
        return;
      }

      const monitor = {
        apiVersion: "monitoring.kubekuma.io/v1" as const,
        kind: "Monitor" as const,
        metadata: {
          namespace: job.namespace,
          name: job.name,
        },
        spec: JSON.parse(cached[0].spec || "{}"),
      };

      // Execute the check
      const result = await executeCheck(monitor, job.timeoutSeconds);

      // Store result in database
      const { heartbeats, desc } = require("../db/schema");
      await db.insert(heartbeats).values({
        monitorNamespace: job.namespace,
        monitorName: job.name,
        monitorId: job.id,
        state: result.state,
        latencyMs: result.latencyMs,
        reason: result.reason,
        message: result.message,
        checkedAt: new Date().toISOString(),
        attempts: 1,
      });

      logger.debug(
        { jobId: job.id, state: result.state, latency: result.latencyMs },
        "Check completed"
      );

      // Get previous heartbeat to detect state changes
      const previousHeartbeat = await db
        .select()
        .from(heartbeats)
        .where(eq(heartbeats.monitorId, job.id))
        .orderBy(drizzleDesc(heartbeats.checkedAt))
        .limit(2);

      const previousState = previousHeartbeat?.[1]?.state || "pending";
      const isStateChange = previousState !== result.state;

      // Trigger alerting engine for state changes
      const alertEvent: AlertEvent = {
        monitorId: job.id,
        monitorNamespace: job.namespace,
        monitorName: job.name,
        previousState: previousState as any,
        currentState: result.state as any,
        reason: result.reason,
        message: result.message,
        latencyMs: result.latencyMs,
        timestamp: new Date(),
        isStateChange,
      };

      await handleAlertEvent(alertEvent);
    } catch (error) {
      logger.error({ jobId: job.id, error }, "Check execution failed");
    }
  };

  const runSchedulerLoop = async () => {
    if (!state.running || !state.isPrimary) return;

    try {
      await processNextJob();
    } catch (error) {
      logger.error({ error }, "Scheduler loop error");
    }

    // Schedule next iteration
    schedulerLoop = setTimeout(() => {
      runSchedulerLoop();
    }, 100); // Check every 100ms if job is ready
  };

  return {
    register: registerJob,
    unregister: unregisterJob,

    async start() {
      if (state.running) return;

      logger.info("Starting scheduler...");

      // Acquire singleton lock (optional in dev mode)
      const locked = await acquireLock();
      if (!locked) {
        logger.warn("Failed to acquire scheduler lock, continuing without lock");
        // Continue anyway in development - skip leader election
      } else {
        // Start lock renewal
        startLockRenewal();
      }

      state.isPrimary = true;
      state.running = true;
      queue = createPriorityQueue();

      // Add any jobs that were registered before scheduler started
      for (const job of state.jobs.values()) {
        queue.add(job);
      }

      logger.info({ jobCount: state.jobs.size }, "Scheduler started with jobs in queue");

      // Start scheduler loop
      runSchedulerLoop();
    },

    async stop() {
      if (!state.running) return;

      logger.info("Stopping scheduler...");

      state.running = false;

      if (schedulerLoop) {
        clearTimeout(schedulerLoop);
        schedulerLoop = null;
      }

      stopLockRenewal();

      if (state.isPrimary) {
        await releaseLock();
        state.isPrimary = false;
      }

      if (queue) {
        queue.clear();
        queue = null;
      }

      logger.info("Scheduler stopped");
    },

    isRunning(): boolean {
      return state.running && state.isPrimary;
    },

    getJobCount(): number {
      return state.jobs.size;
    },
  };
}

/**
 * Export singleton scheduler instance
 */
export const scheduler = createScheduler();
