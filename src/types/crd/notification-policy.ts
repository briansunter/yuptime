import { z } from "zod";
import { SelectorSchema, StatusBaseSchema } from "./common";

// NotificationPolicy spec
export const NotificationPolicySpecSchema = z.object({
  priority: z.number().optional().default(50),
  match: SelectorSchema.optional(),
  triggers: z.object({
    onDown: z.boolean().optional().default(true),
    onUp: z.boolean().optional().default(true),
    onFlapping: z.boolean().optional().default(true),
    onCertExpiring: z.boolean().optional().default(true),
  }),
  routing: z.object({
    providers: z.array(
      z.object({
        ref: z.object({
          name: z.string(),
        }),
      }),
    ),
    dedupe: z.object({
      key: z.string().optional(), // template string
      windowMinutes: z.number().min(1).optional().default(10),
    }),
    rateLimit: z.object({
      minMinutesBetweenAlerts: z.number().min(0).optional().default(0),
    }),
    resend: z.object({
      resendIntervalMinutes: z.number().min(0).optional().default(0),
    }),
  }),
  formatting: z
    .object({
      titleTemplate: z.string().optional(),
      bodyTemplate: z.string().optional(),
    })
    .optional(),
});

export type NotificationPolicySpec = z.infer<
  typeof NotificationPolicySpecSchema
>;

// NotificationPolicy status
export const NotificationPolicyStatusSchema = StatusBaseSchema.extend({
  providersResolved: z.number().optional(),
  lastAppliedAt: z.string().optional(),
});

export type NotificationPolicyStatus = z.infer<
  typeof NotificationPolicyStatusSchema
>;

// Full NotificationPolicy CRD
export const NotificationPolicySchema = z.object({
  apiVersion: z.literal("monitoring.yuptime.io/v1"),
  kind: z.literal("NotificationPolicy"),
  metadata: z.object({
    name: z.string(),
    namespace: z.string(),
    uid: z.string().optional(),
    resourceVersion: z.string().optional(),
    generation: z.number().optional(),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  }),
  spec: NotificationPolicySpecSchema,
  status: NotificationPolicyStatusSchema.optional(),
});

export type NotificationPolicy = z.infer<typeof NotificationPolicySchema>;
