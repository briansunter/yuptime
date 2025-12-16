import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import path from "path";
import { ZodError } from "zod";
import { logger } from "../lib/logger";
import { config } from "../lib/config";
import { registerStatusPageRoutes } from "./routes/status-pages";
import { registerAuthRoutes } from "./routes/auth";
import { sessionMiddleware } from "./middleware/session";
import { apiKeyAuth } from "./middleware/auth";

export async function createApp() {
  const app = Fastify({
    logger,
    trustProxy: true,
  });

  // JWT for session tokens
  await app.register(fastifyJwt, {
    secret: config.sessionSecret,
    sign: {
      expiresIn: config.sessionMaxAge,
    },
  });

  // Cookies for secure session delivery
  await app.register(fastifyCookie, {
    secret: config.sessionSecret,
  });

  // CORS is handled natively in newer Fastify versions
  // For now, skip helmet and cors registration

  // Global error handler for Zod validation errors
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })),
      });
    }

    logger.error({ error, url: request.url, method: request.method }, "Unhandled error");

    return reply.status(500).send({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });

  // Global authentication middleware (runs on all routes)
  // Tries API key auth first, then session auth
  app.addHook("preHandler", async (request, reply) => {
    // Check for API key header
    if (request.headers["x-api-key"]) {
      await apiKeyAuth(request, reply);
    } else {
      // Try session auth (gracefully handles missing/invalid tokens)
      await sessionMiddleware(request, reply);
    }
  });

  // Health check endpoints
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  app.get("/ready", async () => ({
    ready: true,
    timestamp: new Date().toISOString(),
  }));

  // Register authentication routes (login, logout, me)
  await registerAuthRoutes(app);

  // Register API routes
  await app.register(async (app) => {
    // Monitors
    app.get("/monitors", async (request, reply) => {
      return { items: [], total: 0 };
    });

    // Health check
    app.get("/health", async () => ({ ok: true }));
  }, { prefix: "/api/v1" });

  // Register status page routes (public endpoints)
  await registerStatusPageRoutes(app);

  // SPA fallback: route unmatched API requests
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api")) {
      reply.code(404).send({ error: "Not found" });
    } else {
      // For non-API requests, return 404 (frontend not served in this setup)
      reply.code(404).send({ error: "Not found" });
    }
  });

  return app;
}

export type FastifyApp = Awaited<ReturnType<typeof createApp>>;
