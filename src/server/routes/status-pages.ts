/**
 * Status pages routes
 * Public endpoints for status page data and badges
 * Refactored with @fastify/type-provider-zod for type-safe validation
 */

import { FastifyInstance } from "fastify";
import { getDatabase } from "../../db";
import { heartbeats, incidents, crdCache } from "../../db/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";
import {
  StatusPageParamsSchema,
  BadgeParamsSchema,
  UptimeParamsSchema,
  UptimeQuerySchema,
  IncidentsQuerySchema,
} from "../../types/schemas/status-pages";
import type { Incident } from "../../db/schema/incidents";

interface StatusPageGroup {
  name: string;
  description?: string;
  monitors: Array<{
    namespace: string;
    name: string;
    status: "operational" | "degraded" | "down";
    lastCheckedAt?: string;
    latency?: number;
  }>;
}

/**
 * Get monitor current status from latest heartbeat
 */
async function getMonitorStatus(
  namespace: string,
  name: string
): Promise<{
  status: "operational" | "degraded" | "down";
  lastCheckedAt?: string;
  latency?: number;
}> {
  const db = getDatabase();

  const monitorId = `${namespace}/${name}`;

  const latest = await db
    .select()
    .from(heartbeats)
    .where(eq(heartbeats.monitorId, monitorId))
    .orderBy(desc(heartbeats.checkedAt))
    .limit(1);

  if (!latest || latest.length === 0) {
    return {
      status: "down",
      lastCheckedAt: undefined,
    };
  }

  const heartbeat = latest[0];
  let status: "operational" | "degraded" | "down" = "operational";

  if (heartbeat.state === "down") {
    status = "down";
  } else if (heartbeat.state === "flapping") {
    status = "degraded";
  }

  return {
    status,
    lastCheckedAt: heartbeat.checkedAt,
    latency: heartbeat.latencyMs || undefined,
  };
}

/**
 * Calculate overall page status from monitor statuses
 */
function calculateOverallStatus(
  groups: StatusPageGroup[]
): "operational" | "degraded" | "down" {
  let hasDown = false;
  let hasDegraded = false;

  for (const group of groups) {
    for (const monitor of group.monitors) {
      if (monitor.status === "down") {
        hasDown = true;
      } else if (monitor.status === "degraded") {
        hasDegraded = true;
      }
    }
  }

  if (hasDown) return "down";
  if (hasDegraded) return "degraded";
  return "operational";
}

/**
 * Calculate uptime percentage for a monitor over time period
 */
async function calculateUptime(
  monitorId: string,
  days: number = 30
): Promise<number> {
  const db = getDatabase();

  const startTime = new Date();
  startTime.setDate(startTime.getDate() - days);

  const results = await db
    .select({
      state: heartbeats.state,
      count: sql<number>`COUNT(*)`,
    })
    .from(heartbeats)
    .where(
      and(
        eq(heartbeats.monitorId, monitorId),
        gte(heartbeats.checkedAt, startTime.toISOString())
      )
    )
    .groupBy(heartbeats.state);

  let totalChecks = 0;
  let upChecks = 0;

  for (const result of results) {
    const count = Number(result.count);
    totalChecks += count;

    if (result.state === "up") {
      upChecks += count;
    }
  }

  if (totalChecks === 0) {
    return 100;
  }

  return (upChecks / totalChecks) * 100;
}

/**
 * Register status page routes with Zod schemas
 */
export async function registerStatusPageRoutes(
  fastify: FastifyInstance
): Promise<void> {
  const app = fastify;

  /**
   * GET /status/:slug
   * Get status page data
   */
  app.get(
    "/status/:slug",
    async (request, reply) => {
      try {
        const paramsResult = StatusPageParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send({
            error: "Validation failed",
            details: paramsResult.error.issues,
          });
        }
        const { slug } = paramsResult.data;
        const db = getDatabase();

        // Get status page from cache by slug in spec
        const pages = await db
          .select()
          .from(crdCache)
          .where(eq(crdCache.kind, "StatusPage"));

        let pageRow = null;
        for (const page of pages) {
          const spec = JSON.parse(page.spec || "{}");
          if (spec.slug === slug) {
            pageRow = page;
            break;
          }
        }

        if (!pageRow) {
          return reply.status(404).send({
            error: "Status page not found",
          });
        }

        const pageSpec = JSON.parse(pageRow.spec || "{}");

        // If not published, return 404
        if (!pageSpec.published) {
          return reply.status(404).send({
            error: "Status page not published",
          });
        }

        // Build status for each group
        const groups: StatusPageGroup[] = [];

        if (pageSpec.groups && Array.isArray(pageSpec.groups)) {
          for (const group of pageSpec.groups) {
            const monitors = [];

            for (const monitorRef of group.monitors || []) {
              const monitorStatus = await getMonitorStatus(
                monitorRef.ref.namespace,
                monitorRef.ref.name
              );

              monitors.push({
                namespace: monitorRef.ref.namespace,
                name: monitorRef.ref.name,
                ...monitorStatus,
              });
            }

            groups.push({
              name: group.name,
              description: group.description,
              monitors,
            });
          }
        }

        const overallStatus = calculateOverallStatus(groups);

        return reply.send({
          slug,
          title: pageSpec.title,
          description: pageSpec.content?.description,
          publishedAt: new Date().toISOString(),
          overallStatus,
          groups,
          branding: pageSpec.content?.branding,
        });
      } catch (error) {
        logger.error({ error }, "Failed to get status page");
        return reply.status(500).send({
          error: "Failed to retrieve status page",
        });
      }
    }
  );

  /**
   * GET /badge/:slug/:monitor
   * Get SVG badge for monitor
   */
  app.get(
    "/badge/:slug/:monitor",
    async (request, reply) => {
      try {
        const paramsResult = BadgeParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send({
            error: "Validation failed",
            details: paramsResult.error.issues,
          });
        }
        const { monitor } = paramsResult.data;
        const [namespace, name] = monitor.split("/");

        // Get monitor status
        const status = await getMonitorStatus(namespace, name);

        // Generate SVG badge
        const statusColor =
          status.status === "operational"
            ? "#10b981"
            : status.status === "degraded"
              ? "#f59e0b"
              : "#ef4444";

        const svg = `<svg width="200" height="20" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#1f2937;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#374151;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="200" height="20" fill="url(#grad)" />
  <rect x="100" width="100" height="20" fill="${statusColor}" />
  <text x="50" y="14" font-size="12" fill="white" text-anchor="middle" font-family="Arial">
    ${name}
  </text>
  <text x="150" y="14" font-size="12" fill="white" text-anchor="middle" font-family="Arial" font-weight="bold">
    ${status.status.toUpperCase()}
  </text>
</svg>`.trim();

        return reply.type("image/svg+xml").send(svg);
      } catch (error) {
        logger.error({ error }, "Failed to generate badge");
        return reply.status(500).send({
          error: "Failed to generate badge",
        });
      }
    }
  );

  /**
   * GET /uptime/:monitor
   * Get uptime percentage for a monitor
   */
  app.get(
    "/uptime/:monitor",
    async (request, reply) => {
      try {
        const paramsResult = UptimeParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send({
            error: "Validation failed",
            details: paramsResult.error.issues,
          });
        }
        const { monitor } = paramsResult.data;

        const queryResult = UptimeQuerySchema.safeParse(request.query);
        const days = queryResult.success ? queryResult.data.days : 30;

        const uptime = await calculateUptime(
          monitor,
          typeof days === "number" ? days : 30
        );

        return reply.send({
          monitor,
          days: typeof days === "number" ? days : 30,
          uptime: Math.round(uptime * 100) / 100,
        });
      } catch (error) {
        logger.error({ error }, "Failed to calculate uptime");
        return reply.status(500).send({
          error: "Failed to calculate uptime",
        });
      }
    }
  );

  /**
   * GET /api/v1/incidents
   * Get incident history for a monitor
   */
  app.get(
    "/api/v1/incidents",
    async (request, reply) => {
      try {
        const queryResult = IncidentsQuerySchema.safeParse(request.query);
        if (!queryResult.success) {
          return reply.status(400).send({
            error: "Validation failed",
            details: queryResult.error.issues,
          });
        }
        const { monitorId, limit } = queryResult.data;
        const limitValue = limit || 10;

        const db = getDatabase();

        let query = db.select().from(incidents);

        if (monitorId) {
          query = query.where(eq(incidents.monitorId, monitorId));
        }

        const results = await query
          .orderBy(desc(incidents.startedAt))
          .limit(limitValue);

        const formatted = results.map((incident: Incident) => ({
          id: incident.id,
          monitorId: incident.monitorId,
          startedAt: incident.startedAt,
          endedAt: incident.endedAt,
          state: incident.state,
          duration: incident.duration,
          suppressed: incident.suppressed,
        }));

        return reply.send(formatted);
      } catch (error) {
        logger.error({ error }, "Failed to get incidents");
        return reply.status(500).send({
          error: "Failed to retrieve incidents",
        });
      }
    }
  );

  logger.info("Status page routes registered");
}
