/**
 * Zod schemas for status page and monitor endpoints
 * Used for type-safe request/response validation with @fastify/type-provider-zod
 */

import { z } from "zod";

/**
 * Monitor namespace/name format validation
 * Used in several routes for monitor references
 */
const MonitorRefSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-_]+$/,
    "Monitor must be in format: namespace/name",
  );

/**
 * Status page route params
 * Validates GET /status/:slug
 */
export const StatusPageParamsSchema = z.object({
  slug: z.string().min(1, "Slug is required").max(100),
});

export type StatusPageParams = z.infer<typeof StatusPageParamsSchema>;

/**
 * Badge route params
 * Validates GET /badge/:slug/:monitor
 */
export const BadgeParamsSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
  monitor: MonitorRefSchema,
});

export type BadgeParams = z.infer<typeof BadgeParamsSchema>;

/**
 * Uptime route params
 * Validates GET /uptime/:monitor
 */
export const UptimeParamsSchema = z.object({
  monitor: z.string().min(1, "Monitor is required"),
});

export type UptimeParams = z.infer<typeof UptimeParamsSchema>;

/**
 * Uptime query parameters
 * Validates query string on GET /uptime/:monitor
 */
export const UptimeQuerySchema = z.object({
  days: z
    .string()
    .regex(/^\d+$/, "Days must be a number")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).max(365))
    .optional()
    .default("30")
    .transform((val) => (typeof val === "string" ? parseInt(val, 10) : val)),
});

export type UptimeQuery = z.infer<typeof UptimeQuerySchema>;

/**
 * Incidents query parameters
 * Validates GET /api/v1/incidents
 */
export const IncidentsQuerySchema = z.object({
  monitorId: z.string().optional(),
  limit: z
    .string()
    .regex(/^\d+$/, "Limit must be a number")
    .transform((val) => Math.min(parseInt(val, 10), 100))
    .optional()
    .default("10")
    .transform((val) => (typeof val === "string" ? parseInt(val, 10) : val)),
});

export type IncidentsQuery = z.infer<typeof IncidentsQuerySchema>;

/**
 * Monitor status in status page
 */
export const MonitorStatusSchema = z.object({
  namespace: z.string(),
  name: z.string(),
  status: z.enum(["operational", "degraded", "down"]),
  lastCheckedAt: z.string().datetime().optional(),
  latency: z.number().optional(),
});

export type MonitorStatus = z.infer<typeof MonitorStatusSchema>;

/**
 * Monitor group in status page
 */
export const MonitorGroupSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  monitors: z.array(MonitorStatusSchema),
});

export type MonitorGroup = z.infer<typeof MonitorGroupSchema>;

/**
 * Branding configuration for status page
 */
export const BrandingSchema = z.object({
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
});

export type Branding = z.infer<typeof BrandingSchema>;

/**
 * Status page response
 * Validates GET /status/:slug response
 */
export const StatusPageResponseSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  publishedAt: z.string().datetime(),
  overallStatus: z.enum(["operational", "degraded", "down"]),
  groups: z.array(MonitorGroupSchema),
  branding: BrandingSchema.optional(),
});

export type StatusPageResponse = z.infer<typeof StatusPageResponseSchema>;

/**
 * Uptime response
 * Validates GET /uptime/:monitor response
 */
export const UptimeResponseSchema = z.object({
  monitor: z.string(),
  days: z.number().min(1),
  uptime: z.number().min(0).max(100),
});

export type UptimeResponse = z.infer<typeof UptimeResponseSchema>;

/**
 * Incident data in incident list
 */
export const IncidentDataSchema = z.object({
  id: z.number(),
  monitorId: z.string(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  state: z.enum(["down", "up"]),
  reason: z.string().optional(),
});

export type IncidentData = z.infer<typeof IncidentDataSchema>;

/**
 * Incidents list response
 * Validates GET /api/v1/incidents response
 */
export const IncidentsResponseSchema = z.array(IncidentDataSchema);

export type IncidentsResponse = z.infer<typeof IncidentsResponseSchema>;
