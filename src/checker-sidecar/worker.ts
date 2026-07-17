import { createInterface } from "node:readline";
import { AttemptRequestSchema, AttemptResultSchema } from "../check-runner/protocol";
import { createCheckContext, executeCheck } from "../checkers";

const input = createInterface({ input: process.stdin, terminal: false });
process.stdout.write(`${JSON.stringify({ type: "ready", protocolVersion: 1 })}\n`);

async function main() {
  for await (const line of input) {
    let executionId = "unknown";
    let attempt = 1;
    try {
      const request = AttemptRequestSchema.parse(JSON.parse(line));
      executionId = request.executionId;
      attempt = request.attempt;
      const startedAt = new Date().toISOString();
      const remainingMs = Math.max(1, Date.parse(request.deadline) - Date.now());
      const abort = new AbortController();
      const timeout = setTimeout(
        () => abort.abort(new Error("Attempt deadline exceeded")),
        remainingMs,
      );
      try {
        const result = await executeCheck(
          request.monitor,
          Math.max(0.001, remainingMs / 1000),
          createCheckContext(abort.signal),
        );
        const response = AttemptResultSchema.parse({
          ...result,
          executionId,
          attempt,
          startedAt,
          checkedAt: new Date().toISOString(),
        });
        process.stdout.write(`${JSON.stringify(response)}\n`);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const now = new Date().toISOString();
      process.stdout.write(
        `${JSON.stringify({
          executionId,
          attempt,
          startedAt: now,
          checkedAt: now,
          state: "down",
          latencyMs: 0,
          reason: "WORKER_ERROR",
          message: error instanceof Error ? error.message.slice(0, 4096) : "Worker failed",
        })}\n`,
      );
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Worker failed"}\n`);
  process.exit(1);
});
