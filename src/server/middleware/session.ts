/**
 * JWT session management and authentication middleware
 * Handles session creation, verification, and user context attachment
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { getDatabase } from "../../db";
import { sessions } from "../../db/schema";
import { eq, and, gte } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { hashToken } from "../../lib/crypto";

/**
 * JWT payload structure
 * Stored in JWT token and verified on each request
 */
export interface JwtPayload {
  sub: string; // userId (namespace/name format)
  username: string;
  role: "admin" | "editor" | "viewer";
  sessionId: string;
  iat: number; // issued at
  exp: number; // expiration
}

/**
 * User context attached to request
 * Available as request.user in route handlers
 */
export interface UserContext {
  id: string; // namespace/name
  username: string;
  role: "admin" | "editor" | "viewer";
  sessionId: string;
}

/**
 * Extend Fastify request type to include user context
 */
declare global {
  namespace Fastify {
    interface FastifyRequest {
      user?: UserContext;
    }
  }
}

/**
 * Optional session middleware
 * Extracts JWT from cookie or Authorization header and loads session
 * Gracefully handles missing/invalid tokens (continues without user context)
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object (to clear invalid cookies)
 */
export async function sessionMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Check for JWT in httpOnly cookie first, then Authorization header
    const token =
      request.cookies.auth_token ||
      request.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      // No token present - allow anonymous access
      return;
    }

    // Verify JWT signature and parse payload
    let payload: JwtPayload;
    try {
      payload = request.server.jwt.verify<JwtPayload>(token);
    } catch (error) {
      logger.debug({ error }, "Invalid JWT token");
      reply.clearCookie("auth_token");
      return;
    }

    // Verify session exists in database and hasn't expired/been revoked
    const db = getDatabase();
    const tokenHash = hashToken(token);
    const nowISO = new Date().toISOString();

    const [sessionRow] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, payload.sessionId),
          eq(sessions.tokenHash, tokenHash),
          gte(sessions.expiresAt, nowISO)
        )
      );

    if (!sessionRow) {
      // Session revoked, expired, or doesn't exist
      logger.debug(
        { sessionId: payload.sessionId },
        "Session not found or expired"
      );
      reply.clearCookie("auth_token");
      return;
    }

    // Update session activity timestamp
    await db
      .update(sessions)
      .set({ lastActivityAt: nowISO })
      .where(eq(sessions.id, payload.sessionId));

    // Attach user context to request for use in route handlers
    request.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      sessionId: payload.sessionId,
    };

    logger.debug(
      { username: payload.username, sessionId: payload.sessionId },
      "Session verified"
    );
  } catch (error) {
    // Unexpected error during session verification
    logger.error({ error }, "Session middleware error");
    reply.clearCookie("auth_token");
  }
}

/**
 * Require authentication prehandler
 * Use as preHandler on routes that require a logged-in user
 *
 * Example:
 *   app.get('/api/v1/protected', { preHandler: [requireAuth] }, handler)
 *
 * @throws 401 if no authenticated user in request.user
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.status(401).send({
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
  }
}

/**
 * Require specific role(s) prehandler
 * Use as preHandler to enforce role-based access control
 *
 * Example:
 *   app.post('/api/v1/admin-only', { preHandler: [requireRole('admin')] }, handler)
 *
 * @param roles - One or more allowed roles
 * @returns Prehandler function
 * @throws 401 if not authenticated
 * @throws 403 if user doesn't have required role
 */
export function requireRole(
  ...roles: Array<"admin" | "editor" | "viewer">
) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    // First check if authenticated
    if (!request.user) {
      return reply.status(401).send({
        error: "Authentication required",
        code: "UNAUTHORIZED",
      });
    }

    // Then check if user has required role
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({
        error: "Insufficient permissions",
        code: "FORBIDDEN",
        requiredRoles: roles,
        userRole: request.user.role,
      });
    }
  };
}
