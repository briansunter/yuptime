import { z } from "zod";
import { SecretRefSchema, StatusBaseSchema } from "./common";

// StatusPage spec
export const StatusPageSpecSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  title: z.string(),
  published: z.boolean().optional().default(false),
  exposure: z
    .object({
      mode: z.enum(["ingress", "gatewayapi", "manual"]),
      hosts: z.array(z.string()).optional(),
      tls: z
        .object({
          secretRef: SecretRefSchema.optional(),
        })
        .optional(),
    })
    .optional(),
  content: z
    .object({
      description: z.string().optional(),
      branding: z
        .object({
          logoUrl: z.string().optional(),
          faviconUrl: z.string().optional(),
          theme: z.enum(["light", "dark", "system"]).optional(),
        })
        .optional(),
    })
    .optional(),
  groups: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        monitors: z.array(
          z.object({
            ref: z.object({
              namespace: z.string(),
              name: z.string(),
            }),
          }),
        ),
      }),
    )
    .optional(),
  badges: z
    .object({
      enabled: z.boolean().optional().default(true),
      scope: z
        .enum(["allMonitors", "groupOnly"])
        .optional()
        .default("groupOnly"),
    })
    .optional(),
});

export type StatusPageSpec = z.infer<typeof StatusPageSpecSchema>;

// StatusPage status
export const StatusPageStatusSchema = StatusBaseSchema.extend({
  publishedUrl: z.string().optional(),
  monitorCount: z.number().optional(),
  overallStatus: z.enum(["operational", "degraded", "down"]).optional(),
});

export type StatusPageStatus = z.infer<typeof StatusPageStatusSchema>;

// Full StatusPage CRD
export const StatusPageSchema = z.object({
  apiVersion: z.literal("monitoring.yuptime.io/v1"),
  kind: z.literal("StatusPage"),
  metadata: z.object({
    name: z.string(),
    namespace: z.string(),
    uid: z.string().optional(),
    resourceVersion: z.string().optional(),
    generation: z.number().optional(),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  }),
  spec: StatusPageSpecSchema,
  status: StatusPageStatusSchema.optional(),
});

export type StatusPage = z.infer<typeof StatusPageSchema>;
