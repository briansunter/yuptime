import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import { ZodError } from "zod";
import { getDatabase } from "../db";
import type { CrdCache } from "../db/schema";
import { crdCache } from "../db/schema";
import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { apiKeyAuth } from "./middleware/auth";
import { sessionMiddleware } from "./middleware/session";
import { registerAuthRoutes } from "./routes/auth";
import { registerStatusPageRoutes } from "./routes/status-pages";

export async function createApp() {
  const app = Fastify({
    logger: logger as any,
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

    logger.error(
      { error, url: request.url, method: request.method },
      "Unhandled error",
    );

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
      await apiKeyAuth(request as any, reply as any);
    } else {
      // Try session auth (gracefully handles missing/invalid tokens)
      await sessionMiddleware(request as any, reply as any);
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
  await registerAuthRoutes(app as any);

  // Register API routes
  await app.register(
    async (apiApp) => {
      // Monitors - list all monitors from CRD cache
      apiApp.get("/monitors", async () => {
        const db = getDatabase();

        const monitors: CrdCache[] = await db
          .select()
          .from(crdCache)
          .where(eq(crdCache.kind, "Monitor"));

        const items = monitors.map((m) => ({
          namespace: m.namespace,
          name: m.name,
          spec: JSON.parse(m.spec || "{}"),
        }));

        return { items, total: items.length };
      });
    },
    { prefix: "/api/v1" },
  );

  // Register status page routes (public endpoints)
  await registerStatusPageRoutes(app as any);

  // 404 handler for all unmatched routes
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: "Not found" });
  });

  return app;
}

export type FastifyApp = Awaited<ReturnType<typeof createApp>>;
