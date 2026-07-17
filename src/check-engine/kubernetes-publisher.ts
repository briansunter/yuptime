import { sendAlertToAlertmanager } from "../alerting";
import { createCRDWatcher } from "../controller/k8s-client";
import {
  decrementActiveIncidents,
  incrementActiveIncidents,
  recordCheckResult,
  recordStateChange,
} from "../lib/prometheus";
import { MonitorSchema } from "../types/crd";
import type { PublishCandidate, ResultPublisher } from ".";

type StatusWatcher = Pick<ReturnType<typeof createCRDWatcher>, "get" | "patchStatus">;

function isConflict(error: unknown): boolean {
  if (error instanceof Error && /\b409\b/.test(error.message)) return true;
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    code?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown; statusCode?: unknown };
  };
  return (
    candidate.code === 409 ||
    candidate.statusCode === 409 ||
    candidate.response?.status === 409 ||
    candidate.response?.statusCode === 409
  );
}

export function createKubernetesResultPublisher(
  watcher: StatusWatcher = createCRDWatcher("monitoring.yuptime.io", "v1", "monitors"),
): ResultPublisher {
  const activeIncidents = new Set<string>();

  return {
    async publish(candidate: PublishCandidate): Promise<boolean> {
      const namespace = candidate.monitor.metadata.namespace;
      const name = candidate.monitor.metadata.name;

      for (let retry = 0; retry < 5; retry++) {
        const current = MonitorSchema.parse(await watcher.get(name, namespace));
        if (
          current.metadata.uid !== candidate.monitor.metadata.uid ||
          (current.metadata.generation ?? 0) !== (candidate.monitor.metadata.generation ?? 0)
        ) {
          return false;
        }
        const currentScheduledAt = current.status?.lastResult?.scheduledAt;
        if (
          currentScheduledAt &&
          Date.parse(currentScheduledAt) >= Date.parse(candidate.result.scheduledAt ?? "")
        ) {
          return false;
        }

        try {
          await watcher.patchStatus(
            name,
            {
              metadata: { resourceVersion: current.metadata.resourceVersion },
              status: {
                previousResult: current.status?.lastResult,
                lastResult: candidate.result,
                nextRunAt: candidate.nextRunAt,
                observedGeneration: current.metadata.generation,
              },
            },
            namespace,
          );

          recordCheckResult(name, namespace, current.spec.type, {
            state: candidate.result.state,
            latencyMs: candidate.result.latencyMs,
          });
          const previousState = current.status?.lastResult?.state;
          const currentState = candidate.result.state;
          if (previousState !== currentState && (previousState || currentState !== "up")) {
            const fromState = previousState ?? "pending";
            recordStateChange(name, namespace, fromState, currentState);
            const key = `${namespace}/${name}`;
            if (currentState === "down" && !activeIncidents.has(key)) {
              activeIncidents.add(key);
              incrementActiveIncidents(name, namespace, "critical");
            } else if (fromState === "down" && activeIncidents.delete(key)) {
              decrementActiveIncidents(name, namespace, "critical");
            }

            const notify =
              currentState === "down"
                ? (current.spec.alerting?.notifyOn?.down ?? true)
                : currentState === "up"
                  ? (current.spec.alerting?.notifyOn?.up ?? true)
                  : (current.spec.alerting?.notifyOn?.flapping ?? true);
            if (notify) {
              await sendAlertToAlertmanager(
                {
                  ...current,
                  status: { ...current.status, lastResult: candidate.result },
                },
                currentState,
                fromState,
                `Monitor ${name} is ${currentState}`,
              );
            }
          }
          return true;
        } catch (error) {
          if (!isConflict(error) || retry === 4) throw error;
        }
      }
      return false;
    },
  };
}
