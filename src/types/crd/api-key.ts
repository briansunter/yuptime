import { z } from "zod";
import { SecretRefSchema, StatusBaseSchema } from "./common";

// ApiKey spec
export const ApiKeySpecSchema = z.object({
  ownerRef: z.object({
    kind: z.literal("LocalUser"),
    name: z.string(),
  }),
  keyHashSecretRef: SecretRefSchema,
  scopes: z.array(z.string()).optional(),
  disabled: z.boolean().optional().default(false),
  expiresAt: z.string().optional(),
});

export type ApiKeySpec = z.infer<typeof ApiKeySpecSchema>;

// ApiKey status
export const ApiKeyStatusSchema = StatusBaseSchema.extend({
  lastUsedAt: z.string().optional(),
});

export type ApiKeyStatus = z.infer<typeof ApiKeyStatusSchema>;

// Full ApiKey CRD
export const ApiKeySchema = z.object({
  apiVersion: z.literal("monitoring.kubekuma.io/v1"),
  kind: z.literal("ApiKey"),
  metadata: z.object({
    name: z.string(),
    namespace: z.string(),
    uid: z.string().optional(),
    resourceVersion: z.string().optional(),
    generation: z.number().optional(),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  }),
  spec: ApiKeySpecSchema,
  status: ApiKeyStatusSchema.optional(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;
