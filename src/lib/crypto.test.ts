import { describe, expect, test } from "bun:test";
import {
  generateApiKey,
  generateSessionId,
  hashPassword,
  hashToken,
  verifyPassword,
} from "./crypto";

describe("hashPassword and verifyPassword", () => {
  test("correctly hashes and verifies a password", async () => {
    const password = "supersecretpassword123!";
    const hash = await hashPassword(password);

    expect(hash).toBeString();
    expect(hash).toStartWith("$argon2id$");
    expect(hash.length).toBeGreaterThan(50);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  test("rejects incorrect password", async () => {
    const password = "correctpassword";
    const wrongPassword = "wrongpassword";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(wrongPassword, hash);
    expect(isValid).toBe(false);
  });

  test("produces different hashes for same password", async () => {
    const password = "testpassword";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2); // Different salts
    expect(await verifyPassword(password, hash1)).toBe(true);
    expect(await verifyPassword(password, hash2)).toBe(true);
  });

  test("handles empty password", async () => {
    const password = "";
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  test("handles unicode passwords", async () => {
    const password = "пароль123!🔐";
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  test("verifyPassword returns false for invalid hash", async () => {
    const isValid = await verifyPassword("password", "not-a-valid-hash");
    expect(isValid).toBe(false);
  });
});

describe("generateApiKey", () => {
  test("generates key with correct prefix", () => {
    const key = generateApiKey();
    expect(key).toStartWith("kk_live_");
  });

  test("generates key with correct length", () => {
    const key = generateApiKey();
    // kk_live_ (8 chars) + 64 hex chars = 72 chars
    expect(key.length).toBe(8 + 64);
  });

  test("generates unique keys", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(generateApiKey());
    }
    expect(keys.size).toBe(100);
  });

  test("generates keys with valid hex characters", () => {
    const key = generateApiKey();
    const hexPart = key.replace("kk_live_", "");
    expect(hexPart).toMatch(/^[0-9a-f]+$/);
  });
});

describe("hashToken", () => {
  test("produces consistent hash for same input", () => {
    const token =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0";
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
  });

  test("produces different hash for different tokens", () => {
    const token1 = "token1";
    const token2 = "token2";
    const hash1 = hashToken(token1);
    const hash2 = hashToken(token2);
    expect(hash1).not.toBe(hash2);
  });

  test("produces 64 character hex hash (SHA-256)", () => {
    const token = "anytoken";
    const hash = hashToken(token);
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

describe("generateSessionId", () => {
  test("generates valid UUID v4 format", () => {
    const sessionId = generateSessionId();
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(sessionId).toMatch(uuidRegex);
  });

  test("generates unique session IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateSessionId());
    }
    expect(ids.size).toBe(100);
  });
});
