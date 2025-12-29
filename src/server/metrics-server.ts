/**
 * Minimal HTTP server for Prometheus metrics scraping
 *
 * Replaces the full Fastify server with a simple HTTP server
 * that only exposes the /metrics endpoint.
 */

import { createServer } from "node:http";
import { logger } from "../lib/logger";
import { getMetrics } from "../lib/prometheus";

export interface MetricsServerConfig {
  port: number;
  host: string;
}

/**
 * Create a minimal HTTP server that only serves Prometheus metrics
 */
export function createMetricsServer(config: MetricsServerConfig) {
  const server = createServer(async (req, res) => {
    // Only respond to GET /metrics
    if (req.method === "GET" && req.url === "/metrics") {
      try {
        const metrics = await getMetrics();
        res.writeHead(200, {
          "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        });
        res.end(metrics);
      } catch (error) {
        logger.error({ error }, "Failed to generate metrics");
        res.writeHead(500);
        res.end("Internal Server Error\n");
      }
    } else if (req.url === "/health" || req.url === "/healthz") {
      // Health check endpoint
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK\n");
    } else if (req.url === "/ready" || req.url === "/readyz") {
      // Readiness probe endpoint
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK\n");
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found\n");
    }
  });

  let listening = false;

  return {
    start(): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          server.listen(config.port, config.host, () => {
            logger.info({ port: config.port, host: config.host }, "Metrics server started");
            listening = true;
            resolve();
          });
        } catch (error) {
          reject(error);
        }
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve) => {
        if (!listening) {
          resolve();
          return;
        }

        server.close(() => {
          logger.info("Metrics server stopped");
          resolve();
        });
      });
    },
  };
}

export type MetricsServer = ReturnType<typeof createMetricsServer>;
