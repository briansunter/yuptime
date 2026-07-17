import { buildJobForMonitor } from "../controller/job-manager/job-builder";
import { getBatchApiClient, getCoreApiClient } from "../controller/k8s-client";
import { AttemptResultSchema } from "./protocol";
import type { AttemptResult, CheckRunner } from "./types";

export function createKubernetesJobRunner(jobTTLSeconds: number): CheckRunner {
  const batch = getBatchApiClient();
  const core = getCoreApiClient();
  const active = new Set<AbortController>();
  let stopping = false;

  async function waitForResult(
    jobName: string,
    namespace: string,
    signal: AbortSignal,
  ): Promise<AttemptResult> {
    while (!signal.aborted) {
      const job = await batch.readNamespacedJob({ name: jobName, namespace });
      if (job.status?.succeeded || job.status?.failed) {
        const pods = await core.listNamespacedPod({
          namespace,
          labelSelector: `batch.kubernetes.io/job-name=${jobName}`,
        });
        const terminated = pods.items[0]?.status?.containerStatuses?.[0]?.state?.terminated;
        if (!terminated?.message) {
          throw new Error(`Checker Job ${jobName} completed without a structured result`);
        }
        return AttemptResultSchema.parse(JSON.parse(terminated.message));
      }
      await Bun.sleep(250);
    }
    throw signal.reason ?? new Error("Checker Job cancelled");
  }

  return {
    async runAttempt(request, signal) {
      if (stopping) throw new Error("Kubernetes Job runner is stopping");
      const namespace = request.monitor.metadata.namespace;
      const job = buildJobForMonitor(request.monitor, 0, undefined, jobTTLSeconds);
      const container = job.spec?.template.spec?.containers[0];
      if (!container) throw new Error("Checker Job has no container");
      container.args = [
        "--monitor",
        `${namespace}/${request.monitor.metadata.name}`,
        "--runner-result",
      ];
      container.env = [
        ...(container.env ?? []),
        { name: "EXECUTION_ID", value: request.executionId },
        { name: "ATTEMPT", value: request.attempt.toString() },
        { name: "SCHEDULED_AT", value: request.scheduledAt },
        { name: "DEADLINE", value: request.deadline },
      ];
      if (job.spec) {
        job.spec.activeDeadlineSeconds = Math.max(
          1,
          Math.ceil((Date.parse(request.deadline) - Date.now()) / 1000),
        );
      }
      const created = await batch.createNamespacedJob({ namespace, body: job });
      const jobName = created.metadata?.name ?? job.metadata?.name;
      if (!jobName) throw new Error("Kubernetes did not return a checker Job name");
      const controller = new AbortController();
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      active.add(controller);
      try {
        return await waitForResult(jobName, namespace, controller.signal);
      } finally {
        active.delete(controller);
        signal.removeEventListener("abort", abort);
        if (controller.signal.aborted) {
          await batch.deleteNamespacedJob({ name: jobName, namespace }).catch(() => undefined);
        }
      }
    },
    ready: () => Promise.resolve(!stopping),
    shutdown() {
      stopping = true;
      for (const controller of active) controller.abort(new Error("Job runner stopped"));
      return Promise.resolve();
    },
  };
}
