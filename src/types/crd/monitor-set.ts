import { z } from "zod";
import { MonitorSpecSchema, } from "./monitor";
import { StatusBaseSchema } from "./common";

// MonitorSet is a bulk declarative way to create many monitors
export const MonitorSetItemSchema = z.object({
  name: z.string(),
  spec: MonitorSpecSchema.omit({ schedule: true, enabled: true }).extend({
    schedule: MonitorSpecSchema.shape.schedule.optional(),
    enabled: z.boolean().optional(),
  }),
});

export type MonitorSetItem = z.infer<typeof MonitorSetItemSchema>;

// MonitorSet spec
export const MonitorSetSpecSchema = z.object({
  defaults: MonitorSpecSchema.omit({
    type: true,
    target: true,
  })
    .partial()
    .optional(),
  items: z.array(MonitorSetItemSchema),
});

export type MonitorSetSpec = z.infer<typeof MonitorSetSpecSchema>;

// MonitorSet status tracks which items are valid/invalid
export const MonitorSetStatusSchema = StatusBaseSchema.extend({
  validCount: z.number().optional(),
  invalidCount: z.number().optional(),
  itemStatuses: z
    .array(
      z.object({
        name: z.string(),
        ready: z.boolean(),
        message: z.string().optional(),
      })
    )
    .optional(),
});

export type MonitorSetStatus = z.infer<typeof MonitorSetStatusSchema>;

// Full MonitorSet CRD
export const MonitorSetSchema = z.object({
  apiVersion: z.literal("monitoring.kubekuma.io/v1"),
  kind: z.literal("MonitorSet"),
  metadata: z.object({
    name: z.string(),
    namespace: z.string(),
    uid: z.string().optional(),
    resourceVersion: z.string().optional(),
    generation: z.number().optional(),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  }),
  spec: MonitorSetSpecSchema,
  status: MonitorSetStatusSchema.optional(),
});

export type MonitorSet = z.infer<typeof MonitorSetSchema>;
