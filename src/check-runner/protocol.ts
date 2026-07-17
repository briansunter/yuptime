import { z } from "zod";
import { MonitorSchema } from "../types/crd";

export const AttemptRequestSchema = z.object({
  protocolVersion: z.literal(1),
  executionId: z.string().min(1).max(128),
  monitor: MonitorSchema,
  attempt: z.number().int().min(1).max(100),
  scheduledAt: z.string().datetime(),
  deadline: z.string().datetime(),
});

export const AttemptResultSchema = z.object({
  executionId: z.string().min(1).max(128),
  attempt: z.number().int().min(1).max(100),
  startedAt: z.string().datetime(),
  checkedAt: z.string().datetime(),
  state: z.enum(["up", "down"]),
  latencyMs: z.number().nonnegative(),
  reason: z.string().max(256),
  message: z.string().max(4096),
});
