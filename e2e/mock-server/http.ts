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

  // JSON query endpoint for E2E testing
  if (path === "/json/query") {
    return json({
      status: "healthy",
      code: 200,
      services: [
        { name: "api", status: "up", latency: 45 },
        { name: "database", status: "up", latency: 12 },
        { name: "cache", status: "up", latency: 3 },
      ],
      metadata: {
        version: "1.2.3",
        environment: "production",
      },
    });
  }

  // XML endpoint for XPath testing
  if (path === "/xml") {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <status>healthy</status>
  <code>200</code>
  <services>
    <service id="api" status="up">
      <name>API Server</name>
      <latency>45</latency>
    </service>
    <service id="db" status="up">
      <name>Database</name>
      <latency>12</latency>
    </service>
    <service id="cache" status="up">
      <name>Cache</name>
      <latency>3</latency>
    </service>
  </services>
  <metadata>
    <version>1.2.3</version>
    <environment>production</environment>
  </metadata>
</response>`;
    return new Response(xmlContent, {
      headers: { "Content-Type": "application/xml" },
    });
  }

  // XML with missing element for failure testing
  if (path === "/xml/minimal") {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <status>degraded</status>
</response>`;
    return new Response(xmlContent, {
      headers: { "Content-Type": "application/xml" },
    });
  }

  // HTML endpoint for CSS selector testing
  if (path === "/html") {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>System Status</title>
</head>
<body>
  <div id="status" class="status-healthy">System is operational</div>
  <div class="metrics">
    <span class="metric" data-name="uptime">99.9%</span>
    <span class="metric" data-name="requests">1000000</span>
  </div>
  <ul class="services">
    <li class="service up" data-id="api">API Server</li>
    <li class="service up" data-id="db">Database</li>
    <li class="service down" data-id="backup">Backup Service</li>
  </ul>
  <a href="https://example.com/docs" class="docs-link">Documentation</a>
</body>
</html>`;
    return new Response(htmlContent, {
      headers: { "Content-Type": "text/html" },
    });
  }

  // HTML with failure state
  if (path === "/html/error") {
    const htmlContent = `<!DOCTYPE html>
<html>
<body>
  <div id="status" class="status-error">System is down</div>
  <div class="error-message">Critical failure detected</div>
</body>
</html>`;
    return new Response(htmlContent, {
      headers: { "Content-Type": "text/html" },
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
