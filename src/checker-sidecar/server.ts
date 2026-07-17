import { AttemptRequestSchema, AttemptResultSchema } from "../check-runner/protocol";
import { createCheckerSupervisor } from "./supervisor";

const port = Number.parseInt(process.env.CHECKER_PORT ?? "3001", 10);
const concurrency = Number.parseInt(process.env.CHECKER_CONCURRENCY ?? "4", 10);
const supervisor = createCheckerSupervisor(concurrency);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/ready")) {
      return Response.json(supervisor.snapshot(), { status: supervisor.ready() ? 200 : 503 });
    }
    if (request.method !== "POST" || url.pathname !== "/v1/attempts") {
      return new Response("Not Found\n", { status: 404 });
    }
    try {
      const declaredLength = Number(request.headers.get("content-length") ?? "0");
      if (declaredLength > 2_000_000) return new Response("Request too large\n", { status: 413 });
      const attempt = AttemptRequestSchema.parse(await request.json());
      const result = AttemptResultSchema.parse(await supervisor.run(attempt, request.signal));
      return Response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1024) : "Attempt failed";
      const status = message.includes("saturated") ? 429 : 400;
      return Response.json({ error: message }, { status });
    }
  },
});

async function shutdown() {
  server.stop(false);
  await supervisor.stop(Number.parseInt(process.env.CHECKER_SHUTDOWN_GRACE_MS ?? "15000", 10));
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
