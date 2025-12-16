# KubeKuma Implementation Plan: Phases 6-9

**Document Date:** 2025-12-15
**Current Status:** Phases 1-5 COMPLETE (85% to spec)
**Target Completion:** Full spec compliance with all endpoints, auth, metrics, and deployment

---

## Quick Navigation

- **Phase 6:** Authentication & Authorization (Weeks 1-2)
- **Phase 7:** Metrics & Observability (Week 3)
- **Phase 8:** Frontend Dashboard (Weeks 4-6)
- **Phase 9:** Timoni Packaging & Deployment (Week 7-8)

---

# Phase 6: Authentication & Authorization

## Overview

Enable secure access to the system with support for both OIDC (federation) and local users (self-hosted). Implement session management, API keys, and role-based access control.

**Deliverables:**
- ✅ LocalUser/ApiKey CRDs (schema complete)
- 🔲 Login/logout endpoints
- 🔲 Session management middleware
- 🔲 OIDC token exchange and validation
- 🔲 TOTP 2FA implementation
- 🔲 API key middleware
- 🔲 Role-based access control in endpoints

---

## 6.1 Session Management Foundation

### Goal
Establish secure session tokens with expiry and secure cookie handling.

### Implementation

**File:** `src/server/middleware/session.ts` (NEW)

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";

export async function registerSessionMiddleware(app: FastifyInstance) {
  // JWT tokens for stateless session management
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || "changeme",
    sign: { expiresIn: "24h" },
  });

  // Secure cookies for token delivery
  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || "changeme",
    parseOptions: {
      secure: !config.isDev,  // HTTPS only in prod
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 86400,  // 24 hours
    },
  });
}

// Session data type
export interface SessionPayload {
  userId: string;           // LocalUser name or OIDC subject
  username: string;
  role: "admin" | "editor" | "viewer";
  source: "local" | "oidc";
  issuedAt: number;
  expiresAt: number;
  mfaVerified: boolean;
  apiKeyId?: string;        // If using API key
}

// Decode session from request
export async function getSession(
  request: FastifyRequest
): Promise<SessionPayload | null> {
  try {
    const payload = await request.jwtVerify();
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

// Create session token
export function createSessionToken(
  app: FastifyInstance,
  payload: Omit<SessionPayload, "issuedAt" | "expiresAt">
): string {
  return app.jwt.sign(payload);
}
```

**Dependencies to Add:**
```json
{
  "@fastify/jwt": "^7.x",
  "@fastify/cookie": "^9.x"
}
```

### Database Changes

**File:** `src/db/schema/sessions.ts` (NEW)

```typescript
import { text, timestamp, boolean } from "drizzle-orm/sqlite-core";
import { createTableSchema } from "./index";

export const sessions = createTableSchema("sessions", {
  id: text("id").primaryKey(),           // UUID or random
  userId: text("user_id").notNull(),     // LocalUser name or OIDC ID
  tokenHash: text("token_hash").notNull(), // Argon2 hash of token
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(new Date()),
  lastActivityAt: timestamp("last_activity_at").notNull().default(new Date()),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const apiKeySessions = createTableSchema("api_key_sessions", {
  id: text("id").primaryKey(),
  keyId: text("key_id").notNull(),       // ApiKey resource name
  userId: text("user_id").notNull(),     // Owner
  tokenHash: text("token_hash").notNull(), // Argon2 hash
  expiresAt: timestamp("expires_at"),    // Optional expiry
  revokedAt: timestamp("revoked_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().default(new Date()),
});
```

---

## 6.2 Local Authentication

### 6.2.1 Password Hashing

**File:** `src/lib/crypto.ts` (NEW)

```typescript
import argon2 from "argon2";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  timeCost: 3,
  memoryCost: 65536,  // 64 MB
  parallelism: 4,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function hashApiKey(key: string): Promise<string> {
  // Stronger hashing for API keys (higher cost)
  return argon2.hash(key, { ...ARGON2_OPTIONS, timeCost: 4 });
}
```

**Dependencies:**
```json
{
  "argon2": "^0.31.x"
}
```

### 6.2.2 Login Endpoint

**File:** `src/server/routes/auth.ts` (NEW)

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDatabase } from "../../db";
import { crdCache } from "../../db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, hashPassword } from "../../lib/crypto";
import { resolveSecretCached } from "../../lib/secrets";
import { logger } from "../../lib/logger";
import { createSessionToken } from "../middleware/session";

export async function registerAuthRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/login
  app.post<{
    Body: { username: string; password: string };
  }>("/api/v1/auth/login", async (request, reply) => {
    try {
      const { username, password } = request.body;

      if (!username || !password) {
        return reply.status(400).send({
          error: "Missing username or password",
        });
      }

      // 1. Check if local auth is enabled
      const settings = await getSettings();
      if (settings.spec.auth.mode !== "local") {
        return reply.status(403).send({
          error: "Local authentication is disabled",
        });
      }

      // 2. Find LocalUser CRD
      const db = getDatabase();
      const users = await db
        .select()
        .from(crdCache)
        .where(
          and(
            eq(crdCache.kind, "LocalUser"),
            eq(crdCache.name, username)
          )
        );

      if (!users || users.length === 0) {
        logger.warn({ username }, "Login attempt for non-existent user");
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const userCrd = JSON.parse(users[0].spec);
      if (userCrd.disabled) {
        return reply.status(403).send({ error: "User account disabled" });
      }

      // 3. Get password hash from secret
      const passwordSecret = await resolveSecretCached(
        userCrd.passwordHashSecretRef.name,
        userCrd.passwordHashSecretRef.key
      );

      if (!passwordSecret) {
        logger.error({ username }, "Password secret not found");
        return reply.status(500).send({ error: "Internal error" });
      }

      // 4. Verify password
      const passwordValid = await verifyPassword(
        password,
        Buffer.from(passwordSecret, "base64").toString()
      );

      if (!passwordValid) {
        logger.warn({ username }, "Invalid password");
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // 5. Check if MFA is required
      const mfaRequired =
        settings.spec.auth.local.requireMfa === "required" &&
        userCrd.mfa.mode !== "disabled";

      if (mfaRequired && !userCrd.mfa.totpSecretRef) {
        // User must set up MFA first
        return reply.status(403).send({
          error: "MFA required but not configured",
          requiresMfaSetup: true,
        });
      }

      // 6. If MFA required, return temp token for MFA verification
      if (mfaRequired) {
        const tempToken = app.jwt.sign(
          {
            userId: username,
            username,
            role: userCrd.role,
            source: "local",
            mfaVerified: false,
          },
          { expiresIn: "5m" }
        );

        return reply
          .setCookie("kubekuma-mfa-token", tempToken, {
            secure: !config.isDev,
            httpOnly: true,
            sameSite: "strict",
          })
          .send({
            requiresMfa: true,
            mfaToken: tempToken, // Temp token for frontend
          });
      }

      // 7. Create session
      const sessionToken = createSessionToken(app, {
        userId: username,
        username,
        role: userCrd.role,
        source: "local",
        mfaVerified: !mfaRequired,
      });

      reply
        .setCookie("kubekuma-session", sessionToken, {
          secure: !config.isDev,
          httpOnly: true,
          sameSite: "strict",
          maxAge: 86400, // 24h
        })
        .send({
          session: sessionToken,
          user: {
            username,
            role: userCrd.role,
          },
        });

      logger.info({ username }, "User logged in");
    } catch (error) {
      logger.error({ error }, "Login failed");
      return reply.status(500).send({ error: "Login failed" });
    }
  });

  // POST /api/v1/auth/logout
  app.post("/api/v1/auth/logout", async (request, reply) => {
    const session = await getSession(request);
    if (session) {
      logger.info({ username: session.username }, "User logged out");
    }

    return reply
      .clearCookie("kubekuma-session")
      .clearCookie("kubekuma-mfa-token")
      .send({ ok: true });
  });

  // POST /api/v1/auth/verify (check current session)
  app.post("/api/v1/auth/verify", async (request, reply) => {
    const session = await getSession(request);
    if (!session) {
      return reply.status(401).send({ error: "Not authenticated" });
    }

    return reply.send({
      authenticated: true,
      user: {
        username: session.username,
        role: session.role,
        source: session.source,
      },
    });
  });
}

async function getSettings() {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(crdCache)
    .where(eq(crdCache.kind, "KubeKumaSettings"));

  if (!rows || rows.length === 0) {
    throw new Error("KubeKumaSettings not found");
  }

  return JSON.parse(rows[0].spec);
}
```

---

## 6.3 OIDC Integration

### 6.3.1 OIDC Callback Handler

**File:** `src/server/routes/oidc.ts` (NEW)

```typescript
import { FastifyInstance } from "fastify";
import { createSessionToken, getSession } from "../middleware/session";
import { resolveSecretCached } from "../../lib/secrets";
import { logger } from "../../lib/logger";

export async function registerOidcRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/oidc/callback
  app.post<{
    Body: { code: string; state: string };
  }>("/api/v1/auth/oidc/callback", async (request, reply) => {
    try {
      const { code, state } = request.body;
      const settings = await getSettings();

      if (settings.spec.auth.mode !== "oidc") {
        return reply.status(403).send({ error: "OIDC not enabled" });
      }

      const oidcConfig = settings.spec.auth.oidc;

      // 1. Verify state (prevent CSRF)
      const sessionState = request.session?.oidcState;
      if (!sessionState || sessionState !== state) {
        logger.warn("OIDC state mismatch");
        return reply.status(400).send({ error: "Invalid state" });
      }

      // 2. Exchange code for token
      const clientSecret = await resolveSecretCached(
        oidcConfig.clientSecretRef.name,
        oidcConfig.clientSecretRef.key
      );

      const tokenResponse = await fetch(
        `${oidcConfig.issuerUrl}/.well-known/openid-configuration`
      );
      const wellKnown = (await tokenResponse.json()) as {
        token_endpoint: string;
      };

      const tokenResp = await fetch(wellKnown.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: oidcConfig.clientId,
          client_secret: clientSecret,
          redirect_uri: oidcConfig.redirectUrl,
        }).toString(),
      });

      const tokenData = (await tokenResp.json()) as {
        access_token: string;
        id_token: string;
      };

      // 3. Decode and verify ID token (in production, use proper JWT library)
      const idToken = parseJwt(tokenData.id_token);
      const subject = idToken.sub;

      // 4. Get user info
      const userInfoResp = await fetch(
        `${oidcConfig.issuerUrl}/userinfo`,
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        }
      );

      const userInfo = (await userInfoResp.json()) as {
        sub: string;
        preferred_username?: string;
        email?: string;
        [key: string]: any;
      };

      // 5. Get groups claim
      const groups = (idToken[oidcConfig.groupClaim || "groups"] ||
        []) as string[];

      // 6. Map groups to role
      let role: "admin" | "editor" | "viewer" = "viewer";
      for (const mapping of oidcConfig.roleMappings || []) {
        if (
          mapping.matchGroup === "*" ||
          groups.includes(mapping.matchGroup)
        ) {
          role = mapping.role;
          break;
        }
      }

      // 7. Create session
      const sessionToken = createSessionToken(app, {
        userId: subject,
        username: userInfo.preferred_username || userInfo.email || subject,
        role,
        source: "oidc",
        mfaVerified: true, // OIDC assumes MFA is handled by provider
      });

      reply
        .setCookie("kubekuma-session", sessionToken, {
          secure: !config.isDev,
          httpOnly: true,
          sameSite: "strict",
          maxAge: 86400,
        })
        .redirect(302, "/");

      logger.info(
        { subject, role, groups },
        "OIDC login successful"
      );
    } catch (error) {
      logger.error({ error }, "OIDC callback failed");
      return reply.status(500).send({ error: "OIDC authentication failed" });
    }
  });

  // GET /api/v1/auth/oidc/login
  app.get("/api/v1/auth/oidc/login", async (request, reply) => {
    const settings = await getSettings();
    if (settings.spec.auth.mode !== "oidc") {
      return reply.status(403).send({ error: "OIDC not enabled" });
    }

    const oidcConfig = settings.spec.auth.oidc;
    const state = crypto.randomUUID();

    // Store state in session (for CSRF protection)
    request.session.oidcState = state;

    const authUrl = new URL(
      `${oidcConfig.issuerUrl}/authorize`
    );
    authUrl.searchParams.set("client_id", oidcConfig.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", (oidcConfig.scopes || []).join(" "));
    authUrl.searchParams.set("redirect_uri", oidcConfig.redirectUrl);
    authUrl.searchParams.set("state", state);

    return reply.redirect(302, authUrl.toString());
  });
}

function parseJwt(token: string) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
  return JSON.parse(jsonPayload);
}

async function getSettings() {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(crdCache)
    .where(eq(crdCache.kind, "KubeKumaSettings"));

  if (!rows || rows.length === 0) {
    throw new Error("KubeKumaSettings not found");
  }

  return JSON.parse(rows[0].spec);
}
```

**Dependencies:**
```json
{
  "@types/node": "^20.x"  // For crypto module
}
```

---

## 6.4 TOTP 2FA

### 6.4.1 TOTP Generation and Verification

**File:** `src/lib/totp.ts` (NEW)

```typescript
import speakeasy from "speakeasy";
import QRCode from "qrcode";

export async function generateTotpSecret(
  username: string
): Promise<{ secret: string; qrCode: string }> {
  const secret = speakeasy.generateSecret({
    name: `KubeKuma (${username})`,
    issuer: "KubeKuma",
  });

  const qrCode = await QRCode.toDataURL(secret.otpauth_url);

  return {
    secret: secret.base32,
    qrCode,
  };
}

export function verifyTotp(
  secret: string,
  token: string,
  window: number = 1
): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window,
  });
}
```

**Dependencies:**
```json
{
  "speakeasy": "^2.0.x",
  "qrcode": "^1.5.x"
}
```

### 6.4.2 MFA Setup and Verification Endpoints

**File:** `src/server/routes/mfa.ts` (NEW)

```typescript
import { FastifyInstance } from "fastify";
import { generateTotpSecret, verifyTotp } from "../../lib/totp";
import { getSession, createSessionToken } from "../middleware/session";
import { resolveSecretCached } from "../../lib/secrets";

export async function registerMfaRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/mfa/setup
  app.post("/api/v1/auth/mfa/setup", async (request, reply) => {
    const session = await getSession(request);
    if (!session) {
      return reply.status(401).send({ error: "Not authenticated" });
    }

    if (session.mfaVerified === false && !request.body.verifyToken) {
      // Still in MFA verification, need to pass temp token
      return reply.status(403).send({
        error: "Must verify MFA first",
      });
    }

    const { secret, qrCode } = await generateTotpSecret(
      session.username
    );

    // Return temporary secret (not persisted yet)
    return reply.send({
      secret,
      qrCode,
      message:
        "Scan this QR code with your authenticator app, then verify",
    });
  });

  // POST /api/v1/auth/mfa/verify
  app.post<{
    Body: { code: string };
  }>("/api/v1/auth/mfa/verify", async (request, reply) => {
    const mfaToken = request.cookies["kubekuma-mfa-token"];
    if (!mfaToken) {
      return reply.status(401).send({
        error: "MFA verification required",
      });
    }

    // Decode temp MFA token
    let mfaSession: any;
    try {
      mfaSession = await app.jwt.verify(mfaToken);
    } catch {
      return reply.status(401).send({ error: "MFA token expired" });
    }

    if (mfaSession.mfaVerified) {
      return reply.status(400).send({
        error: "Already verified",
      });
    }

    // Get user's TOTP secret from LocalUser CRD
    const db = getDatabase();
    const users = await db
      .select()
      .from(crdCache)
      .where(
        and(
          eq(crdCache.kind, "LocalUser"),
          eq(crdCache.name, mfaSession.userId)
        )
      );

    if (!users || users.length === 0) {
      return reply.status(404).send({ error: "User not found" });
    }

    const userCrd = JSON.parse(users[0].spec);
    if (!userCrd.mfa.totpSecretRef) {
      return reply.status(400).send({
        error: "TOTP not configured",
      });
    }

    // Get TOTP secret from Kubernetes Secret
    const totpSecret = await resolveSecretCached(
      userCrd.mfa.totpSecretRef.name,
      userCrd.mfa.totpSecretRef.key
    );

    if (!totpSecret) {
      return reply.status(500).send({
        error: "TOTP secret not found",
      });
    }

    // Verify code
    const verified = verifyTotp(
      Buffer.from(totpSecret, "base64").toString(),
      request.body.code
    );

    if (!verified) {
      return reply.status(401).send({
        error: "Invalid code",
      });
    }

    // Create full session token
    const sessionToken = createSessionToken(app, {
      ...mfaSession,
      mfaVerified: true,
    });

    return reply
      .clearCookie("kubekuma-mfa-token")
      .setCookie("kubekuma-session", sessionToken, {
        secure: !config.isDev,
        httpOnly: true,
        sameSite: "strict",
        maxAge: 86400,
      })
      .send({
        session: sessionToken,
        message: "MFA verified, session created",
      });
  });

  // POST /api/v1/auth/mfa/disable
  app.post("/api/v1/auth/mfa/disable", async (request, reply) => {
    const session = await getSession(request);
    if (!session) {
      return reply.status(401).send({ error: "Not authenticated" });
    }

    // Update LocalUser CRD to disable MFA (via Kubernetes API)
    // This is handled by kubectl or the UI

    return reply.send({ message: "MFA disabled" });
  });
}
```

---

## 6.5 API Key Authentication

### File: `src/server/middleware/api-key.ts` (NEW)

```typescript
import { FastifyRequest, FastifyReply } from "fastify";
import { getDatabase } from "../../db";
import { crdCache } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { verifyPassword } from "../../lib/crypto";
import { SessionPayload } from "./session";

export async function verifyApiKey(
  request: FastifyRequest
): Promise<SessionPayload | null> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);

  // Find ApiKey CRD with matching hash
  const db = getDatabase();
  const keys = await db
    .select()
    .from(crdCache)
    .where(eq(crdCache.kind, "ApiKey"));

  for (const keyRow of keys) {
    const keyCrd = JSON.parse(keyRow.spec);

    // Get hash from secret
    const hashSecret = await resolveSecretCached(
      keyCrd.keyHashSecretRef.name,
      keyCrd.keyHashSecretRef.key
    );

    if (!hashSecret) continue;

    // Verify token matches hash
    const verified = await verifyPassword(
      token,
      Buffer.from(hashSecret, "base64").toString()
    );

    if (!verified) continue;

    // Check expiry
    if (keyCrd.expiresAt && new Date(keyCrd.expiresAt) < new Date()) {
      continue;
    }

    if (keyCrd.disabled) {
      continue;
    }

    // Get owner (LocalUser)
    const ownerName = keyCrd.ownerRef.name;
    const users = await db
      .select()
      .from(crdCache)
      .where(
        and(
          eq(crdCache.kind, "LocalUser"),
          eq(crdCache.name, ownerName)
        )
      );

    if (!users || users.length === 0) {
      continue;
    }

    const userCrd = JSON.parse(users[0].spec);

    // Update last used timestamp in database
    // (would need a separate table for this)

    return {
      userId: ownerName,
      username: userCrd.username,
      role: userCrd.role,
      source: "local",
      mfaVerified: true,
      apiKeyId: keyRow.name,
      issuedAt: Date.now(),
      expiresAt: new Date(keyCrd.expiresAt || Date.now() + 86400000).getTime(),
    };
  }

  return null;
}

export async function checkApiKeyScope(
  session: SessionPayload,
  requiredScope: string
): Promise<boolean> {
  if (!session.apiKeyId) {
    return true; // Session auth, no scope limits
  }

  const db = getDatabase();
  const keys = await db
    .select()
    .from(crdCache)
    .where(
      and(
        eq(crdCache.kind, "ApiKey"),
        eq(crdCache.name, session.apiKeyId)
      )
    );

  if (!keys || keys.length === 0) {
    return false;
  }

  const keyCrd = JSON.parse(keys[0].spec);
  return (keyCrd.scopes || []).includes(requiredScope);
}
```

---

## 6.6 Route Protection Middleware

### File: `src/server/middleware/auth.ts` (NEW)

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSession } from "./session";
import { verifyApiKey, checkApiKeyScope } from "./api-key";

export async function registerAuthMiddleware(app: FastifyInstance) {
  // Require authentication for protected endpoints
  app.addHook("onRequest", async (request, reply) => {
    // Skip auth for public endpoints
    const publicRoutes = [
      "/health",
      "/ready",
      "/status/",
      "/badge/",
      "/uptime/",
      "/api/v1/incidents",
      "/api/v1/auth/login",
      "/api/v1/auth/oidc/login",
      "/api/v1/auth/oidc/callback",
    ];

    const isPublic = publicRoutes.some((route) =>
      request.url.startsWith(route)
    );
    if (isPublic) {
      return;
    }

    // Try JWT session first
    let session = await getSession(request);

    // Fall back to API key
    if (!session) {
      session = await verifyApiKey(request);
    }

    if (!session) {
      return reply.status(401).send({
        error: "Authentication required",
      });
    }

    // Attach to request
    request.session = session;

    // Check role-based access
    const adminRoutes = [
      "/api/v1/settings",
      "/api/v1/users",
    ];

    const isAdminRoute = adminRoutes.some((route) =>
      request.url.startsWith(route)
    );

    if (isAdminRoute && session.role !== "admin") {
      return reply.status(403).send({
        error: "Admin access required",
      });
    }
  });
}

// Extend FastifyRequest to include session
declare global {
  namespace Fastify {
    interface FastifyRequest {
      session?: SessionPayload;
    }
  }
}
```

---

## 6.7 Integration into app.ts

**Update:** `src/server/app.ts`

```typescript
import { registerAuthMiddleware } from "./middleware/auth";
import { registerSessionMiddleware } from "./middleware/session";
import { registerAuthRoutes } from "./routes/auth";
import { registerOidcRoutes } from "./routes/oidc";
import { registerMfaRoutes } from "./routes/mfa";

export async function createApp() {
  const app = Fastify({ logger, trustProxy: true });

  // Security and middleware
  await app.register(fastifyHelmet);
  await app.register(fastifyCors);

  // NEW: Session and auth
  await registerSessionMiddleware(app);
  await registerAuthMiddleware(app);

  // API routes
  app.register(async (app) => {
    app.prefix = "/api/v1";

    // NEW: Auth routes
    await registerAuthRoutes(app);
    await registerOidcRoutes(app);
    await registerMfaRoutes(app);

    // Existing routes
    app.get("/monitors", ...);
    app.get("/health", ...);
  });

  // Existing routes...
  return app;
}
```

---

## 6.8 Reconciler Updates

**Update:** `src/controller/reconcilers/auth-and-config-reconcilers.ts`

Add:
- Validate LocalUser exists before ApiKey references it
- Validate ApiKey expiry dates are in future
- Validate OIDC issuer is reachable (optional health check)
- Validate API key scopes are valid

---

## 6.9 Phase 6 Completion Checklist

- [ ] Session middleware working (JWT + cookies)
- [ ] LocalUser login endpoint working
- [ ] Password verification with Argon2
- [ ] OIDC flow implemented
- [ ] TOTP setup and verification working
- [ ] API key middleware in place
- [ ] All protected endpoints require auth
- [ ] Role-based access control enforced
- [ ] Session expiry working
- [ ] CSRF protection for OIDC (state parameter)
- [ ] Secure cookie flags set (httpOnly, secure, sameSite)
- [ ] Error messages don't leak user info
- [ ] Rate limiting on login endpoints (to prevent brute force)

---

# Phase 7: Metrics & Observability

## 7.1 Prometheus Metrics Endpoint

### File: `src/server/routes/metrics.ts` (NEW)

```typescript
import { FastifyInstance } from "fastify";
import { getDatabase } from "../../db";
import { crdCache, heartbeats, incidents } from "../../db/schema";
import { eq } from "drizzle-orm";
import prom from "prom-client";

// Prometheus metrics
const monitorStateGauge = new prom.Gauge({
  name: "kubekuma_monitor_state",
  help: "Current state of a monitor (1=up, 0=down, 2=flapping)",
  labelNames: ["namespace", "name"],
});

const monitorLatencyHistogram = new prom.Histogram({
  name: "kubekuma_monitor_latency_ms",
  help: "Monitor check latency in milliseconds",
  labelNames: ["namespace", "name"],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
});

const monitorUptimeGauge = new prom.Gauge({
  name: "kubekuma_monitor_uptime_percent",
  help: "Monitor uptime percentage (0-100)",
  labelNames: ["namespace", "name", "period"],
});

const incidentCountGauge = new prom.Gauge({
  name: "kubekuma_incidents_total",
  help: "Total number of incidents",
  labelNames: ["namespace", "name", "state"],
});

const incidentDurationHistogram = new prom.Histogram({
  name: "kubekuma_incident_duration_seconds",
  help: "Duration of resolved incidents",
  labelNames: ["namespace", "name"],
  buckets: [30, 60, 300, 600, 1800, 3600, 7200],
});

export async function registerMetricsRoute(app: FastifyInstance) {
  app.get("/metrics", async (request, reply) => {
    const settings = await getSettings();

    // Check metrics auth mode
    if (settings.spec.publicEndpoints.metrics.authMode !== "open") {
      // Verify auth (session or API key)
      if (!request.session) {
        return reply.status(401).send({
          error: "Metrics require authentication",
        });
      }
    }

    const db = getDatabase();

    // Gather metrics data
    const monitors = await db
      .select()
      .from(crdCache)
      .where(eq(crdCache.kind, "Monitor"));

    for (const monitor of monitors) {
      const spec = JSON.parse(monitor.spec);
      const status = JSON.parse(monitor.status || "{}");
      const lastResult = status.lastResult || {};

      const namespace = monitor.namespace || "default";
      const name = monitor.name;

      // Monitor state
      const stateValue =
        lastResult.state === "up"
          ? 1
          : lastResult.state === "down"
            ? 0
            : 2;
      monitorStateGauge.set({ namespace, name }, stateValue);

      // Latency
      if (lastResult.latencyMs) {
        monitorLatencyHistogram.observe(
          { namespace, name },
          lastResult.latencyMs
        );
      }

      // Uptime periods
      for (const [period, percentage] of Object.entries(
        status.uptime || {}
      )) {
        monitorUptimeGauge.set(
          { namespace, name, period },
          percentage as number
        );
      }
    }

    // Incidents
    const allIncidents = await db
      .select()
      .from(incidents);

    for (const incident of allIncidents) {
      const [namespace, name] = incident.monitorId.split("/");
      const duration = incident.duration || 0;

      incidentCountGauge.inc({
        namespace,
        name,
        state: incident.state,
      });

      if (incident.duration) {
        incidentDurationHistogram.observe(
          { namespace, name },
          duration / 1000 // Convert to seconds
        );
      }
    }

    // Return Prometheus format
    return reply
      .type("text/plain")
      .send(await prom.register.metrics());
  });
}
```

**Dependencies:**
```json
{
  "prom-client": "^14.x"
}
```

---

## 7.2 Metrics Configuration

**Update:** `src/server/app.ts`

```typescript
import { registerMetricsRoute } from "./routes/metrics";

export async function createApp() {
  // ...

  app.register(async (app) => {
    app.prefix = "/api/v1";

    // NEW
    await registerMetricsRoute(app);

    // Existing routes...
  });

  // Also register at root for standard /metrics path
  await registerMetricsRoute(app);

  return app;
}
```

---

## 7.3 Phase 7 Completion Checklist

- [ ] `/metrics` endpoint returns valid Prometheus format
- [ ] All monitor gauges update correctly
- [ ] Latency histogram has appropriate buckets
- [ ] Uptime percentages calculated accurately
- [ ] Incident metrics collected
- [ ] Metrics auth modes enforced
- [ ] Tested with Prometheus scraper
- [ ] Resource usage metrics (CPU, memory) optional

---

# Phase 8: Frontend Dashboard

## 8.1 Dashboard Pages to Implement

### Overview
- Monitor count summary
- Overall system status
- Recent incidents
- Quick action buttons (silence, acknowledge)

### Monitor Management
- List monitors with filtering/sorting
- Detail view with status history
- Latency graph
- Recent checks table
- Incident timeline

### Configuration Pages
- Notification providers editor
- Notification policies builder
- Status pages editor
- Maintenance windows calendar
- Settings and preferences

### Authentication UI
- Login page
- OIDC callback handling
- MFA setup wizard
- API key management

---

## 8.2 CRUD API Endpoints to Implement

**Each CRD needs:** GET (list + get), POST (create), PUT (update), DELETE

Endpoints:
- `/api/v1/monitors`
- `/api/v1/monitor-sets`
- `/api/v1/notification-providers`
- `/api/v1/notification-policies`
- `/api/v1/status-pages`
- `/api/v1/maintenance-windows`
- `/api/v1/silences`
- `/api/v1/local-users`
- `/api/v1/api-keys`
- `/api/v1/settings`

---

## 8.3 Estimated Time: 2-3 weeks

---

# Phase 9: Timoni Packaging & Deployment

## 9.1 CRD Generation from Zod Schemas

Generate OpenAPI v3 CRD manifests from Zod schemas:

```
src/types/crd/monitor.ts (Zod)
  ↓
openapi-generator
  ↓
k8s/crd/monitoring.kubekuma.io_monitors.yaml
```

---

## 9.2 Timoni Module Structure

```
timoni/
├── cue.mod/
│   └── module.cue
├── templates/
│   ├── config.cue              # Values schema
│   ├── deployment.cue
│   ├── service.cue
│   ├── serviceaccount.cue
│   ├── clusterrole.cue
│   ├── clusterrolebinding.cue
│   ├── ingress.cue
│   ├── configmap.cue           # Settings CRD defaults
│   └── crds.cue
└── examples/
    ├── values.cue              # Example deployment
    └── kustomization.yaml
```

---

## 9.3 Estimated Time: 1 week

---

# Implementation Timeline

```
Week 1-2: Phase 6 (Authentication)
├─ Session middleware
├─ Local auth endpoints
├─ OIDC flow
└─ TOTP 2FA

Week 3: Phase 7 (Metrics)
├─ Prometheus metrics endpoint
├─ Metric collection
└─ Auth enforcement

Weeks 4-6: Phase 8 (Dashboard)
├─ CRUD endpoints
├─ Dashboard UI
├─ Monitor management
└─ Configuration pages

Weeks 7-8: Phase 9 (Deployment)
├─ Timoni module
├─ CRD generation
└─ Documentation
```

---

## Success Criteria

✅ All endpoints functional with proper error handling
✅ Authentication enforced on protected endpoints
✅ Metrics accurate and queryable
✅ Dashboard functional for all CRD types
✅ Timoni module deploys working instance
✅ Complete documentation with examples
✅ Example CRD manifests provided

---

**Document Status:** Ready for implementation
**Approval Required:** Proceed to Phase 6?
