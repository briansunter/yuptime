import { checkerWorkerRestarts, checkerWorkers } from "../lib/prometheus";
import { AttemptResultSchema } from "./protocol";
import {
  type AttemptRequest,
  type AttemptResult,
  type CheckRunner,
  RunnerUnavailableError,
} from "./types";

type SupervisorSnapshot = {
  workers: number;
  healthy: number;
  busy: number;
  restarts: number;
  restartsByReason: Record<string, number>;
};

export function createSidecarRunner(baseUrl = "http://127.0.0.1:3001"): CheckRunner {
  const observedRestarts: Record<string, number> = {};
  return {
    async runAttempt(request: AttemptRequest, signal: AbortSignal): Promise<AttemptResult> {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/v1/attempts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal,
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new RunnerUnavailableError("Checker sidecar is unavailable", { cause: error });
      }
      if (!response.ok) {
        const body = await response.text();
        if (response.status === 429 || response.status >= 500) {
          throw new RunnerUnavailableError(
            `Checker sidecar HTTP ${response.status}: ${body.slice(0, 1024)}`,
          );
        }
        throw new Error(`Checker sidecar HTTP ${response.status}: ${body.slice(0, 1024)}`);
      }
      return AttemptResultSchema.parse(await response.json());
    },
    async ready() {
      try {
        const response = await fetch(`${baseUrl}/ready`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          const snapshot = (await response.json()) as SupervisorSnapshot;
          checkerWorkers.set({ state: "total" }, snapshot.workers);
          checkerWorkers.set({ state: "healthy" }, snapshot.healthy);
          checkerWorkers.set({ state: "busy" }, snapshot.busy);
          for (const [reason, count] of Object.entries(snapshot.restartsByReason ?? {})) {
            const previous = observedRestarts[reason] ?? 0;
            if (count > previous) checkerWorkerRestarts.inc({ reason }, count - previous);
            observedRestarts[reason] = count;
          }
        }
        return response.ok;
      } catch {
        return false;
      }
    },
    shutdown: () => Promise.resolve(),
  };
}
