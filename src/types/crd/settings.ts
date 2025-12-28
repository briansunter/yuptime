import { z } from "zod";
import { SecretRefSchema, StatusBaseSchema } from "./common";

// YuptimeSettings spec
export const YuptimeSettingsSpecSchema = z.object({
  mode: z.object({
    gitOpsReadOnly: z.boolean().optional().default(false),
    singleInstanceRequired: z.boolean().optional().default(true),
  }),

  auth: z.object({
    mode: z.enum(["oidc", "local", "disabled"]),
    oidc: z
      .object({
        issuerUrl: z.string().url(),
        clientId: z.string(),
        clientSecretRef: SecretRefSchema,
        redirectUrl: z.string().url(),
        scopes: z.array(z.string()).optional(),
        groupClaim: z.string().optional(),
        roleMappings: z
          .array(
            z.object({
              matchGroup: z.string(),
              role: z.enum(["admin", "editor", "viewer"]),
            }),
          )
          .optional(),
      })
      .optional(),
    local: z
      .object({
        allowSignup: z.boolean().optional().default(false),
        requireMfa: z.enum(["disabled", "optional", "required"]).optional(),
        bootstrapAdminSecretRef: SecretRefSchema.optional(),
      })
      .optional(),
    apiKeys: z
      .object({
        enabled: z.boolean().optional().default(true),
        maxKeysPerUser: z.number().min(1).optional(),
      })
      .optional(),
  }),

  scheduler: z.object({
    minIntervalSeconds: z.number().min(1).optional().default(20),
    maxConcurrentNetChecks: z.number().min(1).optional().default(200),
    maxConcurrentPrivChecks: z.number().min(1).optional().default(20),
    defaultTimeoutSeconds: z.number().min(1).optional().default(10),
    jitterPercent: z.number().min(0).max(100).optional().default(5),
    flapping: z
      .object({
        enabled: z.boolean().optional().default(true),
        toggleThreshold: z.number().min(1).optional().default(6),
        windowMinutes: z.number().min(1).optional().default(10),
        suppressNotificationsMinutes: z.number().min(0).optional().default(30),
      })
      .optional(),
  }),

  retention: z.object({
    heartbeatsDays: z.number().min(1).optional().default(90),
    checksDays: z.number().min(1).optional().default(14),
    incidentsDays: z.number().min(1).optional().default(365),
    downsample: z
      .object({
        enabled: z.boolean().optional().default(true),
        olderThanDays: z.number().min(1).optional().default(30),
        bucketMinutes: z.number().min(1).optional().default(10),
      })
      .optional(),
  }),

  networking: z.object({
    userAgent: z.string().optional().default("Yuptime/1.0"),
    dns: z
      .object({
        resolvers: z.array(z.string()).optional(),
        timeoutSeconds: z.number().min(1).optional().default(5),
      })
      .optional(),
    ping: z
      .object({
        mode: z
          .enum(["icmp", "tcpFallback", "tcpOnly"])
          .optional()
          .default("tcpFallback"),
        tcpFallbackPort: z.number().min(1).max(65535).optional().default(443),
      })
      .optional(),
  }),

  publicEndpoints: z.object({
    statusPagesEnabled: z.boolean().optional().default(true),
    badgesEnabled: z.boolean().optional().default(true),
    metrics: z
      .object({
        enabled: z.boolean().optional().default(true),
        authMode: z
          .enum(["open", "basic", "apiKey"])
          .optional()
          .default("open"),
        basicAuthSecretRef: SecretRefSchema.optional(),
      })
      .optional(),
  }),

  discovery: z
    .object({
      enabled: z.boolean().optional().default(false),
      sources: z
        .array(
          z.object({
            type: z.enum(["ingress", "gatewayapi", "service"]),
          }),
        )
        .optional(),
      behavior: z
        .object({
          showSuggestionsInUi: z.boolean().optional().default(true),
          writeCrds: z.boolean().optional().default(false),
          defaultHealthPath: z.string().optional().default("/healthz"),
        })
        .optional(),
    })
    .optional(),
});

export type YuptimeSettingsSpec = z.infer<typeof YuptimeSettingsSpecSchema>;

// YuptimeSettings status
export const YuptimeSettingsStatusSchema = StatusBaseSchema.extend({
  lastValidation: z.string().optional(),
  errors: z.array(z.string()).optional(),
});

export type YuptimeSettingsStatus = z.infer<typeof YuptimeSettingsStatusSchema>;

// Full YuptimeSettings CRD (cluster-scoped)
export const YuptimeSettingsSchema = z.object({
  apiVersion: z.literal("monitoring.yuptime.io/v1"),
  kind: z.literal("YuptimeSettings"),
  metadata: z.object({
    name: z.literal("yuptime"), // Only one instance per cluster
    uid: z.string().optional(),
    resourceVersion: z.string().optional(),
    generation: z.number().optional(),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  }),
  spec: YuptimeSettingsSpecSchema,
  status: YuptimeSettingsStatusSchema.optional(),
});

export type YuptimeSettings = z.infer<typeof YuptimeSettingsSchema>;
