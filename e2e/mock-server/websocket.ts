/**
 * WebSocket Mock Server
 *
 * Provides various WebSocket endpoints for testing different scenarios.
 */

import type { ServerWebSocket } from "bun";

interface WebSocketData {
  path: string;
}

export function startWebSocketServer(port: number) {
  const server = Bun.serve<WebSocketData>({
    port,
    fetch(req, server) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Upgrade to WebSocket with path data
      const success = server.upgrade(req, {
        data: { path },
      });

      if (success) {
        return undefined;
      }

      return new Response("WebSocket upgrade failed", { status: 400 });
    },
    websocket: {
      open(ws: ServerWebSocket<WebSocketData>) {
        const path = ws.data.path;

        switch (path) {
          case "/hello":
            // Send greeting immediately on connect
            ws.send("Hello");
            break;

          case "/close":
            // Close immediately
            ws.close(1000, "Intentional close");
            break;

          case "/slow":
            // Send after delay
            setTimeout(() => {
              if (ws.readyState === 1) {
                // OPEN
                ws.send("Delayed response");
              }
            }, 2000);
            break;

          // /echo - handled in message handler
        }
      },

      message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
        const path = ws.data.path;
        const data = typeof message === "string" ? message : message.toString();

        switch (path) {
          case "/echo":
            // Echo back the message
            ws.send(data);
            break;

          case "/slow":
            // Echo with delay
            setTimeout(() => {
              if (ws.readyState === 1) {
                ws.send(data);
              }
            }, 2000);
            break;

          default:
            // Default echo behavior
            ws.send(data);
        }
      },

      close(_ws: ServerWebSocket<WebSocketData>, _code: number, _reason: string) {
        // Connection closed
      },
    },
  });
  return server;
}
