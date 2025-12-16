/**
 * Cryptographic utilities for password hashing, API key generation, and token management
 */

import argon2 from "argon2";
import crypto from "node:crypto";
import { logger } from "./logger";

/**
 * Argon2 hashing options (production-grade security)
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

/**
 * Verify a password against an argon2 hash
 * Used for LocalUser authentication during login
 *
 * @param plainPassword - The password entered by the user
 * @param hash - The argon2 hash from the Kubernetes Secret
 * @returns true if password matches, false otherwise
 */
export async function verifyPassword(
  plainPassword: string,
  hash: string
): Promise<boolean> {
  try {
    logger.debug({ hashLength: hash.length, hashPrefix: hash.substring(0, 30) }, "Verifying password against hash");
    const result = await argon2.verify(hash, plainPassword);
    logger.debug({ result }, "Password verification result");
    return result;
  } catch (error) {
    logger.error({ error, hashLength: hash?.length }, "Password verification failed");
    return false;
  }
}

/**
 * Hash a password using argon2
 * Used when creating new users (future feature)
 *
 * @param plainPassword - The password to hash
 * @returns Argon2 hash string
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  try {
    return await argon2.hash(plainPassword, ARGON2_OPTIONS);
  } catch (error) {
    logger.error({ error }, "Password hashing failed");
    throw new Error("Failed to hash password");
  }
}

/**
 * Verify an API key against an argon2 hash
 * Used for programmatic authentication via X-API-Key header
 *
 * @param plainKey - The API key provided in the request
 * @param hash - The argon2 hash from the Kubernetes Secret
 * @returns true if key matches, false otherwise
 */
export async function verifyApiKey(
  plainKey: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainKey);
  } catch (error) {
    logger.error({ error }, "API key verification failed");
    return false;
  }
}

/**
 * Generate a new API key
 * Format: kk_live_<32 random hex characters>
 *
 * @returns Generated API key
 */
export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  return `kk_live_${randomBytes.toString("hex")}`;
}

/**
 * Hash a JWT token for session tracking
 * Enables session revocation by storing hash instead of full token
 * Uses SHA-256 (fast, sufficient for revocation tracking)
 *
 * @param token - JWT token string
 * @returns SHA-256 hash of token
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a secure random session ID
 * Used as primary key for sessions table
 *
 * @returns UUID v4 string
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}
