import { z } from "zod";
import { SelectorSchema, StatusBaseSchema } from "./common";

// MaintenanceWindow spec
export const MaintenanceWindowSpecSchema = z.object({
  enabled: z.boolean().optional().default(true),
  schedule: z.object({
    start: z.string(),
    end: z.string(),
    recurrence: z
      .object({
        rrule: z.string().optional(),
      })
      .optional(),
  }),
  match: SelectorSchema.optional(),
  behavior: z.object({
    suppressNotifications: z.boolean().optional().default(true),
    statusPage: z
      .object({
        showBanner: z.boolean().optional().default(true),
        bannerText: z.string().optional(),
      })
      .optional(),
  }),
});

export type MaintenanceWindowSpec = z.infer<typeof MaintenanceWindowSpecSchema>;

// MaintenanceWindow status
export const MaintenanceWindowStatusSchema = StatusBaseSchema.extend({
  isActive: z.boolean().optional(),
  nextOccurrence: z.string().optional(),
  monitorCount: z.number().optional(),
});

export type MaintenanceWindowStatus = z.infer<typeof MaintenanceWindowStatusSchema>;

// Full MaintenanceWindow CRD
export const MaintenanceWindowSchema = z.object({
  apiVersion: z.literal("monitoring.kubekuma.io/v1"),
  kind: z.literal("MaintenanceWindow"),
  metadata: z.object({
    name: z.string(),
    namespace: z.string(),
    uid: z.string().optional(),
    resourceVersion: z.string().optional(),
    generation: z.number().optional(),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  }),
  spec: MaintenanceWindowSpecSchema,
  status: MaintenanceWindowStatusSchema.optional(),
});

export type MaintenanceWindow = z.infer<typeof MaintenanceWindowSchema>;
