import { createInterface } from "node:readline";

async function main() {
  process.stdout.write(`${JSON.stringify({ type: "ready", protocolVersion: 1 })}\n`);
  const input = createInterface({ input: process.stdin, terminal: false });
  for await (const line of input) {
    const request = JSON.parse(line) as { executionId: string; attempt: number };
    if (request.executionId === "hang") continue;
    const now = new Date().toISOString();
    process.stdout.write(
      `${JSON.stringify({
        executionId: request.executionId,
        attempt: request.attempt,
        startedAt: now,
        checkedAt: now,
        state: "up",
        latencyMs: 0,
        reason: "OK",
        message: "ok",
      })}\n`,
    );
  }
}

main().catch(() => process.exit(1));
