/**
 * Authentication routes
 * POST /api/v1/auth/login - User login with username/password
 * POST /api/v1/auth/logout - End session
 * GET /api/v1/auth/me - Get current user info
 */

import type { FastifyInstance } from "fastify";
import { getDatabase } from "../../db";
import { crdCache, sessions } from "../../db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import {
  verifyPassword,
  hashToken,
  generateSessionId,
} from "../../lib/crypto";
import { resolveSecretCached } from "../../lib/secrets";
import { config } from "../../lib/config";
import { LoginRequestSchema } from "../../types/schemas/auth";
import { requireAuth } from "../middleware/session";
import type { JwtPayload } from "../middleware/session";
import type { LocalUserSpec, LocalUserStatus } from "../../types/crd/local-user";

/**
 * Register authentication routes
 *
 * @param fastify - Fastify instance
 */
export async function registerAuthRoutes(
  fastify: FastifyInstance
): Promise<void> {
  const app = fastify;

  /**
   * POST /api/v1/auth/login
   * Authenticate with username and password
   *
   * Request body:
   *   username: string (required)
   *   password: string (required)
   *
   * Response:
   *   200 OK: { success: true, user: {...}, token: "..." }
   *   401 Unauthorized: { success: false, error: "..." }
   */
  app.post(
    "/api/v1/auth/login",
    async (request, reply) => {
      // Validate request body with Zod
      const parseResult = LoginRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: "Validation failed",
          details: parseResult.error.issues,
        });
      }

      const { username, password } = parseResult.data;

      try {
        const db = getDatabase();

        // Step 1: Find LocalUser CRD by username
        logger.debug("Querying LocalUser CRDs");
        const userCrds = await db
          .select()
          .from(crdCache)
          .where(eq(crdCache.kind, "LocalUser"));

        // Linear search through CRDs to find by username (stored in spec)
        let matchedUser: any = null;
        for (const user of userCrds) {
          const spec: LocalUserSpec = JSON.parse(user.spec || "{}");
          if (spec.username === username) {
            matchedUser = user;
            break;
          }
        }

        if (!matchedUser) {
          logger.warn({ username }, "Login attempt for non-existent user");
          return reply.status(401).send({
            success: false,
            error: "Invalid username or password",
          });
        }

        const userSpec: LocalUserSpec = JSON.parse(
          matchedUser.spec || "{}"
        );

        // Step 2: Check if user is disabled
        if (userSpec.disabled) {
          logger.warn({ username }, "Login attempt for disabled user");
          return reply.status(401).send({
            success: false,
            error: "Invalid username or password", // Don't reveal it's disabled
          });
        }

        // Step 3: Get password hash - try direct hash first (for testing), then Secret
        let passwordHash: string;

        // Check if passwordHash is directly in spec (dev mode only)
        if (process.env.NODE_ENV === 'development' && 'passwordHash' in userSpec && userSpec.passwordHash) {
          passwordHash = userSpec.passwordHash as string;
          logger.debug({ username }, "Using passwordHash from spec (dev mode only)");
        } else if (userSpec.passwordHashSecretRef) {
          try {
            passwordHash = await resolveSecretCached(
              matchedUser.namespace || "default",
              userSpec.passwordHashSecretRef.name,
              userSpec.passwordHashSecretRef.key
            );
          } catch (error) {
            logger.error(
              {
                username,
                secretRef: userSpec.passwordHashSecretRef,
                error,
              },
              "Failed to retrieve password hash from secret"
            );
            return reply.status(500).send({
              success: false,
              error: "Authentication system error",
            });
          }
        } else {
          logger.error(
            { username },
            "No password hash or secret reference in user spec"
          );
          return reply.status(500).send({
            success: false,
            error: "Authentication system error",
          });
        }

        // Step 4: Verify password against hash
        const isPasswordValid = await verifyPassword(password, passwordHash);

        if (!isPasswordValid) {
          logger.warn({ username }, "Invalid password");
          return reply.status(401).send({
            success: false,
            error: "Invalid username or password",
          });
        }

        // Step 5: Create JWT session
        const sessionId = generateSessionId();
        const userId = `${matchedUser.namespace || "default"}/${matchedUser.name}`;
        const nowMs = Date.now();
        const nowISO = new Date(nowMs).toISOString();
        const expiresAt = new Date(nowMs + config.sessionMaxAge * 1000);

        const payload: JwtPayload = {
          sub: userId,
          username: userSpec.username,
          role: userSpec.role,
          sessionId,
          iat: Math.floor(nowMs / 1000),
          exp: Math.floor(expiresAt.getTime() / 1000),
        };

        // Sign JWT token
        const token = app.jwt.sign(payload);
        const tokenHash = hashToken(token);

        // Step 6: Store session in database (enables revocation)
        await db.insert(sessions).values({
          id: sessionId,
          userId,
          username: userSpec.username,
          role: userSpec.role,
          tokenHash,
          createdAt: nowISO,
          expiresAt: expiresAt.toISOString(),
          lastActivityAt: nowISO,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] || "",
        });

        // Step 7: Set secure httpOnly cookie
        reply.setCookie("auth_token", token, {
          httpOnly: true, // Prevent JavaScript access (XSS protection)
          secure: !config.isDev, // HTTPS only in production
          sameSite: "lax", // CSRF protection
          maxAge: config.sessionMaxAge,
          path: "/",
        });

        logger.info(
          {
            username: userSpec.username,
            userId,
            sessionId,
            role: userSpec.role,
          },
          "User logged in successfully"
        );

        return reply.send({
          success: true,
          user: {
            id: userId,
            username: userSpec.username,
            role: userSpec.role,
          },
          token, // Return token for client storage if needed
        });
      } catch (error) {
        logger.error({ error, username }, "Login error");
        return reply.status(500).send({
          success: false,
          error: "Login failed",
        });
      }
    }
  );

  /**
   * POST /api/v1/auth/logout
   * Terminate current session
   *
   * Response:
   *   200 OK: { success: true, message: "..." }
   */
  app.post(
    "/api/v1/auth/logout",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;

      try {
        const db = getDatabase();

        // Delete session from database (revokes token)
        await db.delete(sessions).where(eq(sessions.id, user.sessionId));

        // Clear cookie
        reply.clearCookie("auth_token");

        logger.info({ username: user.username }, "User logged out");

        return reply.send({
          success: true,
          message: "Logged out successfully",
        });
      } catch (error) {
        logger.error({ error, user }, "Logout error");
        return reply.status(500).send({
          success: false,
          message: "Logout failed",
        });
      }
    }
  );

  /**
   * GET /api/v1/auth/me
   * Get current authenticated user info
   *
   * Response:
   *   200 OK: { id: "...", username: "...", role: "...", namespace: "...", lastLoginAt: "..." }
   *   401 Unauthorized: (handled by requireAuth prehandler)
   */
  app.get(
    "/api/v1/auth/me",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const [namespace, name] = user.id.split("/");

      try {
        const db = getDatabase();

        // Get latest user CRD to fetch status including lastLoginAt
        const userCrds = await db
          .select()
          .from(crdCache)
          .where(eq(crdCache.kind, "LocalUser"));

        const userCrd = userCrds.find(
          (u) => u.namespace === namespace && u.name === name
        );

        let lastLoginAt: string | undefined;
        if (userCrd?.status) {
          const status: LocalUserStatus = JSON.parse(userCrd.status);
          lastLoginAt = status.lastLoginAt;
        }

        return reply.send({
          id: user.id,
          username: user.username,
          role: user.role,
          namespace: namespace || "default",
          lastLoginAt,
        });
      } catch (error) {
        logger.error({ error, user }, "Failed to get user info");
        return reply.status(500).send({
          error: "Failed to retrieve user information",
        });
      }
    }
  );

  logger.info("Authentication routes registered");
}
