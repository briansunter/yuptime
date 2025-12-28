/**
 * Status pages routes
 * Public endpoints for status page data and badges
 * Refactored with @fastify/type-provider-zod for type-safe validation
 */

import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getDatabase } from "../../db";
import { crdCache, incidents } from "../../db/schema";
import type { Incident } from "../../db/schema/incidents";
import { logger } from "../../lib/logger";
import {
  BadgeParamsSchema,
  IncidentsQuerySchema,
  StatusPageParamsSchema,
  UptimeParamsSchema,
  UptimeQuerySchema,
} from "../../types/schemas/status-pages";

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
  name: string,
): Promise<{
  status: "operational" | "degraded" | "down";
  lastCheckedAt?: string;
  latency?: number;
}> {
  const db = getDatabase();
  const monitorId = `${namespace}/${name}`;

  // Use etcd-native API for direct heartbeat lookup
  const heartbeat = await db.heartbeats().getLatest(monitorId);

  if (!heartbeat) {
    return {
      status: "down",
      lastCheckedAt: undefined,
    };
  }

  let status: "operational" | "degraded" | "down" = "operational";

  if (heartbeat.state === "down") {
    status = "down";
  } else if (heartbeat.state === "flapping") {
    status = "degraded";
  }

  return {
    status,
    lastCheckedAt: heartbeat.checkedAt as string,
    latency: heartbeat.latencyMs ? Number(heartbeat.latencyMs) : undefined,
  };
}

/**
 * Calculate overall page status from monitor statuses
 */
function calculateOverallStatus(
  groups: StatusPageGroup[],
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
 * Uses simple heartbeat counting for etcd compatibility
 */
async function calculateUptime(
  monitorId: string,
  days: number = 30,
): Promise<number> {
  const db = getDatabase();

  const startTime = new Date();
  startTime.setDate(startTime.getDate() - days);
  const startTimeIso = startTime.toISOString();

  // Get all heartbeats for this monitor and filter by time
  const allHeartbeats = await db.heartbeats().select().execute();

  // Filter by monitorId and time
  const filtered = allHeartbeats.filter(
    (hb: any) => hb.monitorId === monitorId && hb.checkedAt >= startTimeIso,
  );

  if (filtered.length === 0) {
    return 100; // No data means assume 100% uptime
  }

  const upCount = filtered.filter((hb: any) => hb.state === "up").length;
  return (upCount / filtered.length) * 100;
}

/**
 * Register status page routes with Zod schemas
 */
export async function registerStatusPageRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify;

  /**
   * GET /api/v1/status/:slug
   * Get status page data
   */
  app.get("/api/v1/status/:slug", async (request, reply) => {
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
      const pages = (await db
        .select()
        .from(crdCache)
        .where(eq(crdCache.kind, "StatusPage"))
        .execute()) as any[];

      let pageRow: (typeof pages)[number] | null = null;
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
          const monitors: StatusPageGroup["monitors"] = [];

          for (const monitorRef of group.monitors || []) {
            const monitorStatus = await getMonitorStatus(
              monitorRef.ref.namespace,
              monitorRef.ref.name,
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
  });

  /**
   * GET /api/v1/badge/:slug/:monitor
   * Get SVG badge for monitor
   */
  app.get("/api/v1/badge/:slug/:monitor", async (request, reply) => {
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

      const svg =
        `<svg width="200" height="20" xmlns="http://www.w3.org/2000/svg">
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
  });

  /**
   * GET /api/v1/uptime/:monitor
   * Get uptime percentage for a monitor
   */
  app.get("/api/v1/uptime/:monitor", async (request, reply) => {
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
        typeof days === "number" ? days : 30,
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
  });

  /**
   * GET /api/v1/incidents
   * Get incident history for a monitor
   */
  app.get("/api/v1/incidents", async (request, reply) => {
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

      const results = (await query
        .orderBy(desc(incidents.startedAt))
        .limit(limitValue)
        .execute()) as any[];

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
  });

  /**
   * GET /api/v1/heartbeats/:monitorId
   * Get heartbeat history for a monitor (for charts)
   */
  app.get("/api/v1/heartbeats/:monitorId", async (request, reply) => {
    try {
      const { monitorId } = request.params as { monitorId: string };
      const { limit = 100 } = request.query as { limit?: number };

      const db = getDatabase();
      const decodedMonitorId = decodeURIComponent(monitorId);

      // Get all heartbeats and filter by monitorId
      const allHeartbeats = await db.heartbeats().select().execute();

      const filtered = allHeartbeats
        .filter((hb: any) => hb.monitorId === decodedMonitorId)
        .sort(
          (a: any, b: any) =>
            new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime(),
        )
        .slice(0, Number(limit));

      const heartbeats = filtered.map((hb: any) => ({
        checkedAt: hb.checkedAt,
        latencyMs: hb.latencyMs,
        state: hb.state,
        reason: hb.reason,
      }));

      return reply.send({
        monitorId: decodedMonitorId,
        heartbeats,
        total: heartbeats.length,
      });
    } catch (error) {
      logger.error({ error }, "Failed to get heartbeat history");
      return reply.status(500).send({
        error: "Failed to retrieve heartbeat history",
      });
    }
  });

  /**
   * GET /api/v1/monitors/:monitorId/stats
   * Get aggregated statistics for a monitor
   */
  app.get("/api/v1/monitors/:monitorId/stats", async (request, reply) => {
    try {
      const { monitorId } = request.params as { monitorId: string };
      const decodedMonitorId = decodeURIComponent(monitorId);

      const db = getDatabase();

      // Get latest heartbeat
      const latest = await db.heartbeats().getLatest(decodedMonitorId);

      // Get all heartbeats for the monitor
      const allHeartbeats = await db.heartbeats().select().execute();
      const monitorHeartbeats = allHeartbeats.filter(
        (hb: any) => hb.monitorId === decodedMonitorId,
      );

      const now = new Date();
      const day1Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Calculate uptime and average latency for different time periods
      const calculateStats = (startDate: Date) => {
        const filtered = monitorHeartbeats.filter(
          (hb: any) => new Date(hb.checkedAt) >= startDate,
        );
        if (filtered.length === 0) return { uptime: 100, avgLatency: null };

        const upCount = filtered.filter((hb: any) => hb.state === "up").length;
        const uptime = (upCount / filtered.length) * 100;

        const latencies = filtered
          .filter((hb: any) => hb.latencyMs != null)
          .map((hb: any) => hb.latencyMs);
        const avgLatency =
          latencies.length > 0
            ? latencies.reduce((a: number, b: number) => a + b, 0) /
              latencies.length
            : null;

        return { uptime, avgLatency };
      };

      const stats24h = calculateStats(day1Ago);
      const stats7d = calculateStats(day7Ago);
      const stats30d = calculateStats(day30Ago);

      return reply.send({
        monitorId: decodedMonitorId,
        currentLatency: latest?.latencyMs || null,
        avgLatency24h: stats24h.avgLatency
          ? Math.round(stats24h.avgLatency * 100) / 100
          : null,
        avgLatency7d: stats7d.avgLatency
          ? Math.round(stats7d.avgLatency * 100) / 100
          : null,
        uptime24h: Math.round(stats24h.uptime * 100) / 100,
        uptime7d: Math.round(stats7d.uptime * 100) / 100,
        uptime30d: Math.round(stats30d.uptime * 100) / 100,
        lastCheckedAt: latest?.checkedAt || null,
        state: latest?.state || "pending",
      });
    } catch (error) {
      logger.error({ error }, "Failed to get monitor stats");
      return reply.status(500).send({
        error: "Failed to retrieve monitor statistics",
      });
    }
  });

  logger.info("Status page routes registered");
}
