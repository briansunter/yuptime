import { z } from "zod";
import { SecretRefSchema, StatusBaseSchema } from "./common";

// LocalUser spec (only active if YuptimeSettings.auth.mode=local)
export const LocalUserSpecSchema = z.object({
  username: z.string().min(1),
  passwordHashSecretRef: SecretRefSchema,
  role: z.enum(["admin", "editor", "viewer"]),
  mfa: z
    .object({
      mode: z.enum(["disabled", "optional", "required"]),
      totpSecretRef: SecretRefSchema.optional(),
    })
    .optional(),
  disabled: z.boolean().optional().default(false),
});

export type LocalUserSpec = z.infer<typeof LocalUserSpecSchema>;

// LocalUser status
export const LocalUserStatusSchema = StatusBaseSchema.extend({
  lastLoginAt: z.string().optional(),
  mfaEnabled: z.boolean().optional(),
});

export type LocalUserStatus = z.infer<typeof LocalUserStatusSchema>;

// Full LocalUser CRD
export const LocalUserSchema = z.object({
  apiVersion: z.literal("monitoring.yuptime.io/v1"),
  kind: z.literal("LocalUser"),
  metadata: z.object({
    name: z.string(),
    namespace: z.string(),
    uid: z.string().optional(),
    resourceVersion: z.string().optional(),
    generation: z.number().optional(),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
  }),
  spec: LocalUserSpecSchema,
  status: LocalUserStatusSchema.optional(),
});

export type LocalUser = z.infer<typeof LocalUserSchema>;
