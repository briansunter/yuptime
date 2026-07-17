import { createHash } from "node:crypto";
import {
  type AttemptResult,
  type CheckRunner,
  RunnerUnavailableError,
} from "../check-runner/types";
import { logger } from "../lib/logger";
import {
  checkCoalesced,
  checkerDuration,
  checkQueueDepth,
  checkQueueWait,
  checkRetries,
  checkStartDelay,
  checksInFlight,
  checksTotal,
  schedulerLastTick,
  schedulerOverdueMonitors,
} from "../lib/prometheus";
import type { LastResult, Monitor } from "../types/crd";
import { firstSlotAfter, latestSlotAtOrBefore, slotSequence } from "./schedule";
import type { CheckEngine, CheckEngineSnapshot } from "./types";

export type PublishCandidate = {
  monitor: Monitor;
  result: LastResult;
  nextRunAt: string;
};

export interface ResultPublisher {
  publish(candidate: PublishCandidate): Promise<boolean>;
}

export interface EngineClock {
  wallNow(): number;
  monotonicNow(): number;
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
  sleep(delayMs: number, signal: AbortSignal): Promise<void>;
}

const systemClock: EngineClock = {
  wallNow: () => Date.now(),
  monotonicNow: () => performance.now(),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  sleep: (delayMs, signal) =>
    new Promise((resolve, reject) => {
      const cleanup = () => signal.removeEventListener("abort", abort);
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, delayMs);
      const abort = () => {
        clearTimeout(timer);
        cleanup();
        reject(signal.reason ?? new Error("aborted"));
      };
      signal.addEventListener("abort", abort, { once: true });
    }),
};

type Run = { monitorId: string; scheduledAtMs: number; admittedAtMono: number };
type Entry = {
  monitor: Monitor;
  generation: number;
  nextSlotMs: number;
  state: "idle" | "queued" | "running";
  pendingSlotMs?: number;
  abort?: AbortController;
  revision: number;
};

type HeapNode = { monitorId: string; scheduledAtMs: number; revision: number };

class ScheduleHeap {
  private readonly nodes: HeapNode[] = [];

  push(node: HeapNode) {
    this.nodes.push(node);
    let index = this.nodes.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if ((this.nodes[parent]?.scheduledAtMs ?? 0) <= node.scheduledAtMs) break;
      this.nodes[index] = this.nodes[parent] as HeapNode;
      index = parent;
    }
    this.nodes[index] = node;
  }

  peek(): HeapNode | undefined {
    return this.nodes[0];
  }

  pop(): HeapNode | undefined {
    const first = this.nodes[0];
    const last = this.nodes.pop();
    if (!first || !last || this.nodes.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.nodes.length) break;
      const child =
        right < this.nodes.length &&
        (this.nodes[right]?.scheduledAtMs ?? Number.POSITIVE_INFINITY) <
          (this.nodes[left]?.scheduledAtMs ?? Number.POSITIVE_INFINITY)
          ? right
          : left;
      if ((this.nodes[child]?.scheduledAtMs ?? 0) >= last.scheduledAtMs) break;
      this.nodes[index] = this.nodes[child] as HeapNode;
      index = child;
    }
    this.nodes[index] = last;
    return first;
  }
}

export interface CreateCheckEngineOptions {
  runner: CheckRunner;
  publisher: ResultPublisher;
  concurrency: number;
  queueCapacity: number;
  clock?: EngineClock;
  maxTimerMs?: number;
}

function monitorId(monitor: Monitor): string {
  return `${monitor.metadata.namespace}/${monitor.metadata.name}`;
}

function executionId(monitor: Monitor, scheduledAtMs: number): string {
  return createHash("sha256")
    .update(
      `${monitor.metadata.uid ?? monitorId(monitor)}:${monitor.metadata.generation ?? 0}:${new Date(scheduledAtMs).toISOString()}`,
    )
    .digest("hex")
    .slice(0, 32);
}

function sameSchedulingIdentity(left: Monitor, right: Monitor): boolean {
  return (
    left.metadata.uid === right.metadata.uid &&
    (left.metadata.generation ?? 0) === (right.metadata.generation ?? 0) &&
    JSON.stringify(left.spec.schedule) === JSON.stringify(right.spec.schedule) &&
    left.spec.enabled === right.spec.enabled
  );
}

export function createCheckEngine(options: CreateCheckEngineOptions): CheckEngine {
  const clock = options.clock ?? systemClock;
  const entries = new Map<string, Entry>();
  const scheduleHeap = new ScheduleHeap();
  const pendingHeap = new ScheduleHeap();
  const queue: Run[] = [];
  let running = false;
  let inFlight = 0;
  let lastTickAtMs: number | undefined;
  let runnerReady = false;
  let timer: unknown;
  let wakeRearmScheduled = false;
  let stopping: Promise<void> | undefined;

  function clearWakeTimer() {
    if (timer !== undefined) {
      clock.clearTimer(timer);
      timer = undefined;
    }
  }

  function validHeapHead(): HeapNode | undefined {
    while (true) {
      const node = scheduleHeap.peek();
      if (!node) return undefined;
      const entry = entries.get(node.monitorId);
      if (
        entry &&
        entry.monitor.spec.enabled !== false &&
        entry.revision === node.revision &&
        entry.nextSlotMs === node.scheduledAtMs
      ) {
        return node;
      }
      scheduleHeap.pop();
    }
  }

  function scheduleEntry(id: string, entry: Entry) {
    scheduleHeap.push({ monitorId: id, scheduledAtMs: entry.nextSlotMs, revision: entry.revision });
  }

  function setPending(id: string, entry: Entry, scheduledAtMs: number) {
    entry.pendingSlotMs = Math.max(entry.pendingSlotMs ?? 0, scheduledAtMs);
    if (entry.state === "idle") {
      pendingHeap.push({
        monitorId: id,
        scheduledAtMs: entry.pendingSlotMs,
        revision: entry.revision,
      });
    }
  }

  function validPendingHead(): HeapNode | undefined {
    while (true) {
      const node = pendingHeap.peek();
      if (!node) return undefined;
      const entry = entries.get(node.monitorId);
      if (
        entry &&
        entry.revision === node.revision &&
        entry.state === "idle" &&
        entry.pendingSlotMs === node.scheduledAtMs
      ) {
        return node;
      }
      pendingHeap.pop();
    }
  }

  function requestWakeRearm() {
    if (wakeRearmScheduled) return;
    wakeRearmScheduled = true;
    queueMicrotask(() => {
      wakeRearmScheduled = false;
      armWakeTimer();
    });
  }

  function armWakeTimer() {
    clearWakeTimer();
    if (!running) return;
    const now = clock.wallNow();
    const earliest = validHeapHead()?.scheduledAtMs ?? Number.POSITIVE_INFINITY;
    const maxTimerMs = Math.min(options.maxTimerMs ?? 30_000, runnerReady ? 30_000 : 1_000);
    const delay = Number.isFinite(earliest)
      ? Math.max(0, Math.min(maxTimerMs, earliest - now))
      : maxTimerMs;
    timer = clock.setTimer(() => {
      timer = undefined;
      tick();
    }, delay);
  }

  function insertQueue(run: Run): boolean {
    if (queue.length >= options.queueCapacity) return false;
    queue.push(run);
    queue.sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
    const entry = entries.get(run.monitorId);
    if (entry) entry.state = "queued";
    return true;
  }

  function admitDue(entry: Entry, id: string, now: number) {
    const sequence = slotSequence(entry.monitor, now);
    const latestDue = latestSlotAtOrBefore(sequence, now);
    if (latestDue === null || entry.nextSlotMs > now) return;

    entry.nextSlotMs = firstSlotAfter(sequence, now);
    scheduleEntry(id, entry);
    if (entry.state === "idle") {
      if (
        !insertQueue({
          monitorId: id,
          scheduledAtMs: latestDue,
          admittedAtMono: clock.monotonicNow(),
        })
      ) {
        setPending(id, entry, latestDue);
      }
    } else {
      checkCoalesced.inc({ reason: entry.state }, 1);
      setPending(id, entry, latestDue);
    }
  }

  function promotePending() {
    while (queue.length < options.queueCapacity) {
      const node = validPendingHead();
      if (!node || node.scheduledAtMs > clock.wallNow()) break;
      const entry = entries.get(node.monitorId);
      if (!entry || entry.state !== "idle") break;
      pendingHeap.pop();
      if (
        insertQueue({
          monitorId: node.monitorId,
          scheduledAtMs: node.scheduledAtMs,
          admittedAtMono: clock.monotonicNow(),
        })
      ) {
        entry.pendingSlotMs = undefined;
      }
    }
  }

  function tick() {
    if (!running) return;
    const now = clock.wallNow();
    lastTickAtMs = now;
    schedulerLastTick.set(now / 1000);
    if (!runnerReady) {
      options.runner
        .ready()
        .then((ready) => {
          runnerReady = ready;
          if (ready) drain();
        })
        .catch((error) => logger.warn({ error }, "Runner readiness check failed"));
    }
    while ((validHeapHead()?.scheduledAtMs ?? Number.POSITIVE_INFINITY) <= now) {
      const node = scheduleHeap.pop();
      if (!node) break;
      const entry = entries.get(node.monitorId);
      if (entry && entry.revision === node.revision) admitDue(entry, node.monitorId, now);
    }
    promotePending();
    checkQueueDepth.set(queue.length);
    checksInFlight.set(inFlight);
    schedulerOverdueMonitors.set(
      [...entries.values()].filter(
        (entry) => entry.pendingSlotMs !== undefined || entry.nextSlotMs <= now,
      ).length,
    );
    drain();
    armWakeTimer();
  }

  function finishRun(id: string) {
    const entry = entries.get(id);
    if (!entry) return;
    entry.abort = undefined;
    entry.state = "idle";
    if (entry.pendingSlotMs !== undefined) {
      pendingHeap.push({
        monitorId: id,
        scheduledAtMs: entry.pendingSlotMs,
        revision: entry.revision,
      });
    }
    promotePending();
  }

  async function executeRun(run: Run, entry: Entry) {
    const monitor = entry.monitor;
    const id = run.monitorId;
    const generation = entry.generation;
    const abort = new AbortController();
    entry.abort = abort;
    entry.state = "running";
    const schedule = monitor.spec.schedule;
    const idempotencyKey = executionId(monitor, run.scheduledAtMs);
    let finalResult: LastResult | undefined;
    let firstStartedAt: string | undefined;
    const maxAttempts = (schedule.retries?.maxRetries ?? 0) + 1;

    for (let attempt = 1; attempt <= maxAttempts && !abort.signal.aborted; attempt++) {
      try {
        const attemptStartedMono = clock.monotonicNow();
        let result: AttemptResult;
        let infrastructureRetries = 0;
        while (true) {
          try {
            const request = {
              protocolVersion: 1 as const,
              executionId: idempotencyKey,
              monitor,
              attempt,
              scheduledAt: new Date(run.scheduledAtMs).toISOString(),
              deadline: new Date(clock.wallNow() + schedule.timeoutSeconds * 1000).toISOString(),
            };
            result = await options.runner.runAttempt(request, abort.signal);
            break;
          } catch (error) {
            if (!(error instanceof RunnerUnavailableError) || abort.signal.aborted) throw error;
            infrastructureRetries++;
            runnerReady = false;
            if (infrastructureRetries >= 5) {
              setPending(id, entry, run.scheduledAtMs);
              return;
            }
            await clock
              .sleep(Math.min(5_000, 250 * 2 ** Math.min(infrastructureRetries, 5)), abort.signal)
              .catch(() => undefined);
          }
        }
        firstStartedAt ??= result.startedAt;
        finalResult = {
          executionId: idempotencyKey,
          scheduledAt: new Date(run.scheduledAtMs).toISOString(),
          startedAt: firstStartedAt,
          checkedAt: result.checkedAt,
          attempts: attempt,
          state: result.state,
          latencyMs: result.latencyMs,
          reason: result.reason,
          message: result.message,
        };
        if (attempt === 1) {
          checkQueueWait.observe(
            { type: monitor.spec.type },
            Math.max(0, attemptStartedMono - run.admittedAtMono) / 1000,
          );
          checkStartDelay.observe(
            { type: monitor.spec.type },
            Math.max(0, Date.parse(result.startedAt) - run.scheduledAtMs) / 1000,
          );
        }
        checkerDuration.observe(
          { type: monitor.spec.type },
          Math.max(0, Date.parse(result.checkedAt) - Date.parse(result.startedAt)) / 1000,
        );
        checksTotal.inc(
          { type: monitor.spec.type, result: result.state, reason: result.reason },
          1,
        );
        if (attempt > 1) checkRetries.inc({ type: monitor.spec.type, reason: result.reason }, 1);
        if (result.state === "up" || attempt === maxAttempts) break;
      } catch (error) {
        const now = new Date(clock.wallNow()).toISOString();
        firstStartedAt ??= now;
        finalResult = {
          executionId: idempotencyKey,
          scheduledAt: new Date(run.scheduledAtMs).toISOString(),
          startedAt: firstStartedAt,
          checkedAt: now,
          attempts: attempt,
          state: "down",
          latencyMs: 0,
          reason: abort.signal.aborted ? "CANCELLED" : "RUNNER_ERROR",
          message: error instanceof Error ? error.message : "Checker runner failed",
        };
      }

      if (attempt < maxAttempts && !abort.signal.aborted) {
        await clock
          .sleep((schedule.retries?.retryIntervalSeconds ?? 1) * 1000, abort.signal)
          .catch(() => undefined);
      }
    }

    const current = entries.get(id);
    if (
      finalResult &&
      !abort.signal.aborted &&
      current &&
      current.generation === generation &&
      current.monitor.metadata.uid === monitor.metadata.uid
    ) {
      await options.publisher.publish({
        monitor: current.monitor,
        result: finalResult,
        nextRunAt: new Date(current.nextSlotMs).toISOString(),
      });
    }
  }

  function drain() {
    while (running && runnerReady && inFlight < options.concurrency && queue.length > 0) {
      const run = queue.shift();
      if (!run) break;
      const entry = entries.get(run.monitorId);
      if (!entry || entry.monitor.spec.enabled === false || entry.state !== "queued") continue;
      inFlight++;
      promotePending();
      checkQueueDepth.set(queue.length);
      checksInFlight.set(inFlight);
      executeRun(run, entry)
        .catch((error) => logger.error({ monitorId: run.monitorId, error }, "Check run failed"))
        .finally(() => {
          inFlight--;
          checksInFlight.set(inFlight);
          finishRun(run.monitorId);
          drain();
        });
    }
  }

  return {
    async start() {
      if (running) return;
      runnerReady = await options.runner.ready();
      running = true;
      tick();
    },
    upsert(monitor) {
      const id = monitorId(monitor);
      if (monitor.spec.enabled === false) {
        this.remove(id);
        return;
      }
      const existing = entries.get(id);
      if (existing && sameSchedulingIdentity(existing.monitor, monitor)) {
        existing.monitor = monitor;
        return;
      }
      existing?.abort?.abort(new Error("Monitor generation changed"));
      for (let index = queue.length - 1; index >= 0; index--) {
        if (queue[index]?.monitorId === id) queue.splice(index, 1);
      }
      const now = clock.wallNow();
      const sequence = slotSequence(monitor, now);
      const publishedAt = monitor.status?.lastResult?.scheduledAt;
      const afterMs = publishedAt ? Date.parse(publishedAt) : sequence.firstSlotMs - 1;
      entries.set(id, {
        monitor,
        generation: monitor.metadata.generation ?? 0,
        nextSlotMs: firstSlotAfter(sequence, afterMs),
        state: "idle",
        revision: (existing?.revision ?? 0) + 1,
      });
      scheduleEntry(id, entries.get(id) as Entry);
      if (running) requestWakeRearm();
    },
    remove(id) {
      const entry = entries.get(id);
      entry?.abort?.abort(new Error("Monitor removed"));
      entries.delete(id);
      for (let index = queue.length - 1; index >= 0; index--) {
        if (queue[index]?.monitorId === id) queue.splice(index, 1);
      }
      armWakeTimer();
    },
    snapshot(): CheckEngineSnapshot {
      let overdueMonitors = 0;
      const now = clock.wallNow();
      for (const entry of entries.values()) {
        if (entry.pendingSlotMs !== undefined || entry.nextSlotMs <= now) overdueMonitors++;
      }
      return {
        running,
        registeredMonitors: entries.size,
        queueDepth: queue.length,
        inFlight,
        overdueMonitors,
        lastTickAt: lastTickAtMs === undefined ? undefined : new Date(lastTickAtMs).toISOString(),
        runnerReady,
        oldestQueuedMs:
          queue.length === 0
            ? 0
            : Math.max(
                0,
                clock.monotonicNow() -
                  Math.min(...queue.map((queuedRun) => queuedRun.admittedAtMono)),
              ),
      };
    },
    stop(graceMs) {
      if (stopping) return stopping;
      stopping = (async () => {
        running = false;
        clearWakeTimer();
        const deadline = clock.monotonicNow() + graceMs;
        while (inFlight > 0 && clock.monotonicNow() < deadline) {
          await clock.sleep(Math.min(25, graceMs), new AbortController().signal);
        }
        for (const entry of entries.values()) entry.abort?.abort(new Error("Engine stopped"));
        await options.runner.shutdown(Math.max(0, deadline - clock.monotonicNow()));
        runnerReady = false;
      })();
      return stopping;
    },
  };
}

export type { CheckEngine, CheckEngineSnapshot } from "./types";
