import { AttemptResultSchema } from "../check-runner/protocol";
import type { AttemptRequest, AttemptResult } from "../check-runner/types";
import { logger } from "../lib/logger";

type Pending = {
  request: AttemptRequest;
  resolve(result: AttemptResult): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
  abort: () => void;
};

type Worker = {
  id: number;
  process: ReturnType<typeof Bun.spawn>;
  pending?: Pending;
  healthy: boolean;
};

export interface CheckerSupervisor {
  run(request: AttemptRequest, signal: AbortSignal): Promise<AttemptResult>;
  ready(): boolean;
  snapshot(): {
    workers: number;
    healthy: number;
    busy: number;
    restarts: number;
    restartsByReason: Record<string, number>;
  };
  stop(graceMs: number): Promise<void>;
}

export interface CheckerSupervisorOptions {
  workerCommand?: string[];
  hardDeadlineGraceMs?: number;
}

export function createCheckerSupervisor(
  concurrency: number,
  options: CheckerSupervisorOptions = {},
): CheckerSupervisor {
  const workers = new Map<number, Worker>();
  let stopping = false;
  let restarts = 0;
  const restartsByReason: Record<string, number> = {};

  function recordRestart(reason: string) {
    const label = reason.includes("deadline")
      ? "timeout"
      : reason.includes("cancel")
        ? "cancelled"
        : reason.includes("invalid output")
          ? "invalid_output"
          : reason.includes("write")
            ? "write_failure"
            : reason.includes("stdout")
              ? "missing_stdout"
              : "exit";
    restarts++;
    restartsByReason[label] = (restartsByReason[label] ?? 0) + 1;
  }

  function rejectPending(worker: Worker, error: Error) {
    if (!worker.pending) return;
    clearTimeout(worker.pending.timeout);
    worker.pending.abort();
    worker.pending.reject(error);
    worker.pending = undefined;
  }

  function replaceWorker(worker: Worker, reason: string) {
    rejectPending(worker, new Error(`Checker worker ${reason}`));
    worker.healthy = false;
    worker.process.kill("SIGKILL");
    workers.delete(worker.id);
    if (!stopping) {
      recordRestart(reason);
      spawnWorker(worker.id);
    }
  }

  function timeoutWorker(worker: Worker) {
    const pending = worker.pending;
    if (!pending) return;
    clearTimeout(pending.timeout);
    pending.abort();
    worker.pending = undefined;
    const checkedAt = new Date().toISOString();
    const startedAt = new Date(
      Date.parse(pending.request.deadline) -
        pending.request.monitor.spec.schedule.timeoutSeconds * 1000,
    ).toISOString();
    pending.resolve({
      executionId: pending.request.executionId,
      attempt: pending.request.attempt,
      startedAt,
      checkedAt,
      state: "down",
      latencyMs: Math.max(0, Date.parse(checkedAt) - Date.parse(startedAt)),
      reason: "TIMEOUT",
      message: "Checker exceeded its hard deadline",
    });
    worker.healthy = false;
    worker.process.kill("SIGKILL");
    workers.delete(worker.id);
    if (!stopping) {
      recordRestart("exceeded hard deadline");
      spawnWorker(worker.id);
    }
  }

  async function readOutput(worker: Worker) {
    const stdout = worker.process.stdout;
    if (!stdout || typeof stdout === "number") {
      replaceWorker(worker, "has no stdout");
      return;
    }
    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        while (buffer.includes("\n")) {
          const newline = buffer.indexOf("\n");
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          const parsed = JSON.parse(line) as unknown;
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "type" in parsed &&
            parsed.type === "ready"
          ) {
            worker.healthy = true;
            continue;
          }
          const pending = worker.pending;
          if (!pending) continue;
          try {
            const result = AttemptResultSchema.parse(parsed);
            if (
              result.executionId !== pending.request.executionId ||
              result.attempt !== pending.request.attempt
            ) {
              throw new Error("worker response identity does not match its request");
            }
            clearTimeout(pending.timeout);
            pending.abort();
            worker.pending = undefined;
            pending.resolve(result);
          } catch (error) {
            replaceWorker(worker, `returned invalid output: ${String(error)}`);
            return;
          }
        }
      }
    } catch (error) {
      if (!stopping) logger.warn({ workerId: worker.id, error }, "Checker worker output failed");
    }
    if (!stopping && workers.get(worker.id) === worker) replaceWorker(worker, "exited");
  }

  function spawnWorker(id: number) {
    const process = Bun.spawn(options.workerCommand ?? ["bun", "src/checker-sidecar/worker.ts"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
      env: processEnvWithoutCredentials(),
    });
    const worker: Worker = { id, process, healthy: false };
    workers.set(id, worker);
    readOutput(worker).catch((error) =>
      logger.error({ workerId: id, error }, "Checker worker reader failed"),
    );
    process.exited
      .then((exitCode) => {
        if (!stopping && workers.get(id) === worker) {
          logger.warn({ workerId: id, exitCode }, "Checker worker exited");
          replaceWorker(worker, "exited");
        }
      })
      .catch((error) => logger.error({ workerId: id, error }, "Checker worker wait failed"));
  }

  function processEnvWithoutCredentials(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (
        value !== undefined &&
        !key.startsWith("YUPTIME_AUTH_") &&
        !key.startsWith("YUPTIME_CRED_")
      ) {
        env[key] = value;
      }
    }
    env.YUPTIME_WORKER_PROTOCOL = "stdio";
    return env;
  }

  for (let id = 0; id < concurrency; id++) spawnWorker(id);

  return {
    run(request, signal) {
      if (stopping) return Promise.reject(new Error("Checker supervisor is stopping"));
      const worker = [...workers.values()].find(
        (candidate) => candidate.healthy && !candidate.pending,
      );
      if (!worker) return Promise.reject(new Error("Checker supervisor is saturated"));
      const remainingMs = Math.max(1, Date.parse(request.deadline) - Date.now());
      return new Promise((resolve, reject) => {
        const onAbort = () => replaceWorker(worker, "cancelled");
        signal.addEventListener("abort", onAbort, { once: true });
        const timeout = setTimeout(
          () => timeoutWorker(worker),
          remainingMs + (options.hardDeadlineGraceMs ?? 250),
        );
        worker.pending = {
          request,
          resolve,
          reject,
          timeout,
          abort: () => signal.removeEventListener("abort", onAbort),
        };
        try {
          if (!worker.process.stdin || typeof worker.process.stdin === "number") {
            throw new Error("Checker worker has no stdin");
          }
          worker.process.stdin.write(`${JSON.stringify(request)}\n`);
          worker.process.stdin.flush();
        } catch (error) {
          replaceWorker(worker, `write failed: ${String(error)}`);
        }
      });
    },
    ready: () =>
      workers.size === concurrency && [...workers.values()].some((worker) => worker.healthy),
    snapshot: () => ({
      workers: workers.size,
      healthy: [...workers.values()].filter((worker) => worker.healthy).length,
      busy: [...workers.values()].filter((worker) => worker.pending).length,
      restarts,
      restartsByReason: { ...restartsByReason },
    }),
    async stop(graceMs) {
      stopping = true;
      const deadline = performance.now() + graceMs;
      while (
        [...workers.values()].some((worker) => worker.pending) &&
        performance.now() < deadline
      ) {
        await Bun.sleep(10);
      }
      for (const worker of workers.values()) {
        rejectPending(worker, new Error("Checker supervisor stopped"));
        worker.process.kill("SIGTERM");
      }
      await Promise.allSettled([...workers.values()].map((worker) => worker.process.exited));
      workers.clear();
    },
  };
}
