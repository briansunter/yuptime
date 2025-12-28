import { z } from "zod";
import { SecretRefSchema, StatusBaseSchema } from "./common";

// Provider configurations
export const NotificationProviderConfigSchema = z.object({
  slack: z
    .object({
      webhookUrlSecretRef: SecretRefSchema,
    })
    .optional(),
  discord: z
    .object({
      webhookUrlSecretRef: SecretRefSchema,
    })
    .optional(),
  telegram: z
    .object({
      botTokenSecretRef: SecretRefSchema,
      chatIdSecretRef: SecretRefSchema,
    })
    .optional(),
  smtp: z
    .object({
      host: z.string(),
      port: z.number(),
      useTls: z.boolean().optional(),
      usernameSecretRef: SecretRefSchema.optional(),
      passwordSecretRef: SecretRefSchema.optional(),
      from: z.string(),
      to: z.array(z.string()),
    })
    .optional(),
  webhook: z
    .object({
      urlSecretRef: SecretRefSchema,
      method: z
        .enum(["GET", "POST", "PUT", "DELETE"])
        .optional()
        .default("POST"),
      headers: z
        .array(
          z.object({
            name: z.string(),
            value: z.string().optional(),
            valueFromSecretRef: SecretRefSchema.optional(),
          }),
        )
        .optional(),
      template: z.string().optional(),
    })
    .optional(),
  gotify: z
    .object({
      baseUrlSecretRef: SecretRefSchema,
      tokenSecretRef: SecretRefSchema,
    })
    .optional(),
  pushover: z
    .object({
      userKeySecretRef: SecretRefSchema,
      apiTokenSecretRef: SecretRefSchema,
      deviceSecretRef: SecretRefSchema.optional(),
    })
    .optional(),
  apprise: z
    .object({
      urlSecretRef: SecretRefSchema,
    })
    .optional(),
});

export type NotificationProviderConfig = z.infer<
  typeof NotificationProviderConfigSchema
>;

// NotificationProvider spec
export const NotificationProviderSpecSchema = z.object({
  type: z.enum([
    "slack",
    "discord",
    "telegram",
    "smtp",
    "webhook",
    "gotify",
    "pushover",
    "apprise",
  ]),
  enabled: z.boolean().optional().default(true),
  config: NotificationProviderConfigSchema,
});

export type NotificationProviderSpec = z.infer<
  typeof NotificationProviderSpecSchema
>;

// NotificationProvider status
export const NotificationProviderStatusSchema = StatusBaseSchema.extend({
  lastTestAt: z.string().optional(),
  lastError: z.string().optional(),
  isHealthy: z.boolean().optional(),
});

export type NotificationProviderStatus = z.infer<
  typeof NotificationProviderStatusSchema
>;

// Full NotificationProvider CRD
export const NotificationProviderSchema = z.object({
  apiVersion: z.literal("monitoring.yuptime.io/v1"),
  kind: z.literal("NotificationProvider"),
  metadata: z.object({
    name: z.string(),
    namespace: z.string(),
    uid: z.string().optional(),
    resourceVersion: z.string().optional(),
    generation: z.number().optional(),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  }),
  spec: NotificationProviderSpecSchema,
  status: NotificationProviderStatusSchema.optional(),
});

export type NotificationProvider = z.infer<typeof NotificationProviderSchema>;
