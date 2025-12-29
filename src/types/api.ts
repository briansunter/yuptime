import { z } from "zod";

// Standard API response format
export const ApiResponseSchema = <T extends z.ZodType>(dataSchema?: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema ? dataSchema.optional() : z.unknown().optional(),
    error: z.string().optional(),
    errors: z.record(z.string()).optional(),
  });

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string>;
};

// List response
export interface ListResponse<T> {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
}

// Monitor query filters
export const MonitorFilterSchema = z.object({
  namespace: z.string().optional(),
  state: z.enum(["up", "down", "pending", "flapping", "paused"]).optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(1000).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

export type MonitorFilter = z.infer<typeof MonitorFilterSchema>;

// Incident filter
export const IncidentFilterSchema = z.object({
  monitorId: z.string().optional(),
  namespace: z.string().optional(),
  state: z.enum(["open", "closed"]).optional(),
  acknowledged: z.boolean().optional(),
  suppressed: z.boolean().optional(),
  limit: z.number().min(1).max(1000).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

export type IncidentFilter = z.infer<typeof IncidentFilterSchema>;

// Push request (for push monitor type)
export const PushRequestSchema = z.object({
  state: z.enum(["up", "down"]),
  latencyMs: z.number().optional(),
  message: z.string().optional(),
});

export type PushRequest = z.infer<typeof PushRequestSchema>;

// Error response
export interface ErrorResponse {
  success: false;
  error: string;
  errors?: Record<string, string>;
}

// Pagination helper
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

// Standard success response wrapper
export function success<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

// Standard error response wrapper
export function error(
  message: string,
  errors?: Record<string, string>,
): ApiResponse<never> {
  const result: ApiResponse<never> = {
    success: false,
    error: message,
  };
  if (errors) {
    result.errors = errors;
  }
  return result;
}
