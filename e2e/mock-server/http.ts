/**
 * HTTP Mock Server
 *
 * Provides various HTTP endpoints for testing different scenarios.
 */

// Store received alerts for verification
const receivedAlerts: unknown[] = [];

export function startHttpServer(port: number) {
  const server = Bun.serve({
    port,
    fetch: handleRequest,
  });
  return server;
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Health check
  if (path === "/health") {
    return json({ status: "healthy" });
  }

  // Status code endpoint: /status/:code
  if (path.startsWith("/status/")) {
    const code = parseInt(path.split("/")[2] || "200", 10);
    return new Response(JSON.stringify({ status: code }), {
      status: code,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Slow response: /slow/:ms
  if (path.startsWith("/slow/")) {
    const ms = parseInt(path.split("/")[2] || "1000", 10);
    await sleep(ms);
    return json({ delayed: ms });
  }

  // Keyword matching endpoints
  if (path === "/keyword") {
    return new Response("This response contains the SUCCESS keyword for testing.", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (path === "/keyword/missing") {
    return new Response("This response does not contain the expected word.", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // JSON query endpoints
  if (path === "/json") {
    return json({ status: "ok", value: 42 });
  }

  if (path === "/json/nested") {
    return json({
      data: {
        items: [
          { id: 1, name: "first" },
          { id: 2, name: "second" },
        ],
        meta: { total: 2, page: 1 },
      },
    });
  }

  // Echo POST body
  if (path === "/echo" && req.method === "POST") {
    const body = await req.text();
    return new Response(body, {
      headers: {
        "Content-Type": req.headers.get("Content-Type") || "text/plain",
      },
    });
  }

  // Return request headers
  if (path === "/headers") {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return json({ headers });
  }

  // Hang forever (for timeout testing)
  if (path === "/hang") {
    // Never respond - connection will timeout
    await new Promise(() => {
      // Intentionally never resolves
    });
    return new Response(""); // Never reached
  }

  // Close connection immediately
  if (path === "/close") {
    // Return a response that signals connection close
    return new Response(null, { status: 444 }); // nginx-style connection close
  }

  // Redirect
  if (path === "/redirect") {
    return Response.redirect(`http://${req.headers.get("host")}/health`, 302);
  }

  // Infinite redirect loop
  if (path === "/redirect/loop") {
    return Response.redirect(`http://${req.headers.get("host")}/redirect/loop`, 302);
  }

  // Content-type endpoint: /content-type/:type
  if (path.startsWith("/content-type/")) {
    const type = path.split("/")[2] || "text/plain";
    return new Response("content", {
      headers: { "Content-Type": type },
    });
  }

  // Mock Alertmanager endpoints
  if (path === "/alertmanager/api/v1/alerts" && req.method === "POST") {
    const alerts = await req.json();
    receivedAlerts.push(...(Array.isArray(alerts) ? alerts : [alerts]));
    return json({ status: "success" });
  }

  if (path === "/alertmanager/alerts") {
    return json({ alerts: receivedAlerts });
  }

  if (path === "/alertmanager/alerts/clear" && req.method === "POST") {
    receivedAlerts.length = 0;
    return json({ status: "cleared" });
  }

  // Default 404
  return new Response("Not Found", { status: 404 });
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
