import { z } from "zod";
import { StatusBaseSchema } from "./common";

// Silence spec
export const SilenceSpecSchema = z.object({
  expiresAt: z.string(),
  match: z.object({
    names: z
      .array(
        z.object({
          namespace: z.string(),
          name: z.string(),
        }),
      )
      .optional(),
    namespaces: z.array(z.string()).optional(),
    labels: z.record(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
  reason: z.string().optional(),
});

export type SilenceSpec = z.infer<typeof SilenceSpecSchema>;

// Silence status
export const SilenceStatusSchema = StatusBaseSchema.extend({
  isActive: z.boolean().optional(),
  expiresIn: z.string().optional(),
  affectedCount: z.number().optional(),
});

export type SilenceStatus = z.infer<typeof SilenceStatusSchema>;

// Full Silence CRD
export const SilenceSchema = z.object({
  apiVersion: z.literal("monitoring.yuptime.io/v1"),
  kind: z.literal("Silence"),
  metadata: z.object({
    name: z.string(),
    namespace: z.string(),
    uid: z.string().optional(),
    resourceVersion: z.string().optional(),
    generation: z.number().optional(),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  }),
  spec: SilenceSpecSchema,
  status: SilenceStatusSchema.optional(),
});

export type Silence = z.infer<typeof SilenceSchema>;
