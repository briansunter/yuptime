/**
 * API key authentication middleware
 * Validates API keys from X-API-Key header against ApiKey CRDs
 */

import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getDatabase } from "../../db";
import { crdCache } from "../../db/schema";
import { verifyApiKey } from "../../lib/crypto";
import { logger } from "../../lib/logger";
import { resolveSecretCached } from "../../lib/secrets";
import type { LocalUserSpec } from "../../types/crd/local-user";
import type { UserContext } from "./session";

/**
 * ApiKey CRD spec type (minimal subset we need)
 */
interface ApiKeySpec {
  ownerRef: {
    kind: string;
    name: string;
  };
  keyHashSecretRef: {
    name: string;
    key: string;
  };
  expiresAt?: string;
  disabled?: boolean;
  scopes?: string[];
}

/**
 * API key authentication middleware
 * Validates X-API-Key header against ApiKey CRDs stored in Kubernetes
 *
 * Flow:
 * 1. Extract API key from X-API-Key header
 * 2. Query crd_cache for all ApiKey CRDs
 * 3. For each key, get hash from Kubernetes Secret
 * 4. Verify API key matches hash using argon2
 * 5. Check expiration and disabled status
 * 6. Load owning user from LocalUser CRD
 * 7. Attach user context to request
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 * @throws 401 if API key is invalid
 * @throws 403 if user account is disabled
 * @throws 500 on unexpected errors
 */
export async function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const apiKeyHeader = request.headers["x-api-key"] as string | undefined;

  // No API key provided - let session auth handle it
  if (!apiKeyHeader) {
    return;
  }

  try {
    const db = getDatabase();

    // Get all ApiKey CRDs from cache
    const apiKeyCrds = (await db
      .select()
      .from(crdCache)
      .where(eq(crdCache.kind, "ApiKey"))
      .execute()) as any[];

    if (apiKeyCrds.length === 0) {
      logger.debug("No API keys configured");
      return reply.status(401).send({
        error: "Invalid API key",
        code: "INVALID_API_KEY",
      });
    }

    // Try to match against each API key
    for (const crd of apiKeyCrds) {
      const spec: ApiKeySpec = JSON.parse(crd.spec || "{}");

      // Skip disabled keys
      if (spec.disabled) {
        logger.debug({ keyName: crd.name }, "API key is disabled");
        continue;
      }

      // Check if key has expired
      if (spec.expiresAt && new Date(spec.expiresAt) < new Date()) {
        logger.debug({ keyName: crd.name }, "API key has expired");
        continue;
      }

      // Get the hash from Kubernetes Secret
      let keyHash: string;
      try {
        keyHash = await resolveSecretCached(
          crd.namespace || "default",
          spec.keyHashSecretRef.name,
          spec.keyHashSecretRef.key,
        );
      } catch (error) {
        logger.warn(
          {
            keyName: crd.name,
            secretRef: spec.keyHashSecretRef,
            error,
          },
          "Failed to resolve API key hash from secret",
        );
        continue;
      }

      // Verify the API key matches the stored hash
      const isValid = await verifyApiKey(apiKeyHeader, keyHash);

      if (!isValid) {
        // Key doesn't match this one, try next
        continue;
      }

      // API key matched! Now get the owning user
      const userName = spec.ownerRef.name;
      const userNamespace = crd.namespace || "default";

      // Find LocalUser CRD in same namespace
      const userCrds = (await db
        .select()
        .from(crdCache)
        .where(eq(crdCache.kind, "LocalUser"))
        .execute()) as any[];

      const userCrd = userCrds.find(
        (u) => u.namespace === userNamespace && u.name === userName,
      );

      if (!userCrd) {
        logger.warn(
          {
            keyName: crd.name,
            ownerRef: spec.ownerRef,
            namespace: userNamespace,
          },
          "API key owner (LocalUser) not found",
        );
        continue;
      }

      // Get user spec
      const userSpec: LocalUserSpec = JSON.parse(userCrd.spec || "{}");

      // Check if user is disabled
      if (userSpec.disabled) {
        logger.warn({ username: userSpec.username }, "User account disabled");
        return reply.status(403).send({
          error: "User account disabled",
          code: "USER_DISABLED",
        });
      }

      // Successfully authenticated with API key
      const userContext: UserContext = {
        id: `${userNamespace}/${userName}`,
        username: userSpec.username,
        role: userSpec.role,
        sessionId: `apikey-${crd.name}`, // Pseudo-session ID for API keys
      };

      request.user = userContext;

      logger.info(
        {
          username: userSpec.username,
          apiKeyName: crd.name,
          scope: request.url,
        },
        "API key authentication successful",
      );

      return;
    }

    // No API key matched - return 401
    logger.warn(
      { apiKeyHeaderLength: apiKeyHeader.length },
      "API key not found or invalid",
    );
    return reply.status(401).send({
      error: "Invalid API key",
      code: "INVALID_API_KEY",
    });
  } catch (error) {
    logger.error({ error }, "API key authentication middleware error");
    return reply.status(500).send({
      error: "Authentication error",
      code: "AUTH_ERROR",
    });
  }
}
