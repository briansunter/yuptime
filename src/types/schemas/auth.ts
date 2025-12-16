/**
 * Zod schemas for authentication endpoints
 */

import { z } from "zod";

/**
 * Login request schema
 * Validates POST /api/v1/auth/login
 */
export const LoginRequestSchema = z.object({
  username: z.string().min(1, "Username is required").trim(),
  password: z.string().min(1, "Password is required"),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * Login response schema
 * 200 OK: successful authentication
 * 401 Unauthorized: invalid credentials
 */
export const LoginResponseSchema = z.object({
  success: z.boolean(),
  user: z
    .object({
      id: z.string(), // namespace/name
      username: z.string(),
      role: z.enum(["admin", "editor", "viewer"]),
    })
    .optional(),
  token: z.string().optional(), // JWT token for client storage
  error: z.string().optional(),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/**
 * Current user response schema
 * Validates GET /api/v1/auth/me
 */
export const CurrentUserSchema = z.object({
  id: z.string(), // namespace/name
  username: z.string(),
  role: z.enum(["admin", "editor", "viewer"]),
  namespace: z.string(),
  lastLoginAt: z.string().datetime().optional(),
});

export type CurrentUser = z.infer<typeof CurrentUserSchema>;

/**
 * Logout response schema
 * Validates POST /api/v1/auth/logout
 */
export const LogoutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

/**
 * Error response schema
 * Used for validation errors and other error responses
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.any().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
