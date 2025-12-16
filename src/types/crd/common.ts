import { z } from "zod";

// Common Kubernetes metadata
export const KubeObjectMetaSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  uid: z.string().optional(),
  resourceVersion: z.string().optional(),
  generation: z.number().optional(),
  creationTimestamp: z.string().optional(),
  labels: z.record(z.string()).optional(),
  annotations: z.record(z.string()).optional(),
});

export type KubeObjectMeta = z.infer<typeof KubeObjectMetaSchema>;

// Standard condition types used by all CRDs
export const ConditionSchema = z.object({
  type: z.string(), // Valid, Reconciled, Ready
  status: z.enum(["True", "False", "Unknown"]),
  reason: z.string().optional(),
  message: z.string().optional(),
  lastTransitionTime: z.string(),
});

export type Condition = z.infer<typeof ConditionSchema>;

// Secret reference (uniform across CRDs)
export const SecretRefSchema = z.object({
  name: z.string(),
  key: z.string(),
  namespace: z.string().optional(), // Optional - defaults to resource namespace
});

export type SecretRef = z.infer<typeof SecretRefSchema>;

// Selector patterns
export const LabelSelectorSchema = z.object({
  matchLabels: z.record(z.string()).optional(),
  matchExpressions: z
    .array(
      z.object({
        key: z.string(),
        operator: z.enum(["In", "NotIn", "Exists", "DoesNotExist"]),
        values: z.array(z.string()).optional(),
      })
    )
    .optional(),
});

export type LabelSelector = z.infer<typeof LabelSelectorSchema>;

export const SelectorSchema = z.object({
  matchNamespaces: z.array(z.string()).optional(),
  matchLabels: LabelSelectorSchema.optional(),
  matchTags: z.array(z.string()).optional(),
  matchNames: z
    .array(
      z.object({
        namespace: z.string(),
        name: z.string(),
      })
    )
    .optional(),
});

export type Selector = z.infer<typeof SelectorSchema>;

// Standard status base
export const StatusBaseSchema = z.object({
  observedGeneration: z.number().optional(),
  conditions: z.array(ConditionSchema).optional(),
});

export type StatusBase = z.infer<typeof StatusBaseSchema>;

// Generic API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string>;
}

// CRD list response
export interface CrdListResponse<T> {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
}
