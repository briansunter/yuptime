/**
 * Seed test data into the crd_cache for testing
 * Usage: bun seed-test-data.ts
 */

import { Database } from "bun:sqlite";
import path from "path";

async function seedTestData() {
  console.log("Seeding test data...");

  // Open database
  const dbPath = "/data/kubekuma.db";
  console.log("Opening database at:", dbPath);
  const sqlite = new Database(dbPath);

  try {
    // Create crd_cache table if it doesn't exist (matching Drizzle schema)
    console.log("Creating crd_cache table...");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS crd_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        apiVersion TEXT NOT NULL,
        namespace TEXT NOT NULL,
        name TEXT NOT NULL,
        generation INTEGER NOT NULL,
        resourceVersion TEXT,
        spec TEXT NOT NULL,
        status TEXT,
        labels TEXT,
        annotations TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✓ crd_cache table exists or created");

    // Create sessions table if it doesn't exist (matching Drizzle schema)
    console.log("Creating sessions table...");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        username TEXT NOT NULL,
        role TEXT NOT NULL,
        tokenHash TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expiresAt TEXT NOT NULL,
        lastActivityAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ipAddress TEXT,
        userAgent TEXT
      );
    `);
    console.log("✓ sessions table exists or created");

    // Create heartbeats table if it doesn't exist
    console.log("Creating heartbeats table...");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS heartbeats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitorNamespace TEXT NOT NULL,
        monitorName TEXT NOT NULL,
        monitorId TEXT NOT NULL,
        state TEXT NOT NULL,
        latencyMs REAL,
        reason TEXT,
        message TEXT,
        checkedAt TEXT NOT NULL,
        attempts INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✓ heartbeats table exists or created");

    // Create incidents table if it doesn't exist
    console.log("Creating incidents table...");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitorNamespace TEXT NOT NULL,
        monitorName TEXT NOT NULL,
        monitorId TEXT NOT NULL,
        state TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        endedAt TEXT,
        duration INTEGER,
        suppressed INTEGER DEFAULT 0,
        suppressReason TEXT,
        acknowledged INTEGER DEFAULT 0,
        acknowledgedAt TEXT,
        acknowledgedBy TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✓ incidents table exists or created");

    // Create audit_events table if it doesn't exist
    console.log("Creating audit_events table...");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resourceType TEXT NOT NULL,
        resourceKey TEXT NOT NULL,
        eventType TEXT NOT NULL,
        actor TEXT,
        details TEXT,
        changesSummary TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✓ audit_events table exists or created");

    // Create notification_deliveries table if it doesn't exist
    console.log("Creating notification_deliveries table...");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS notification_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incidentId INTEGER NOT NULL,
        monitorId TEXT NOT NULL,
        policyName TEXT NOT NULL,
        providerName TEXT NOT NULL,
        providerType TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        lastAttemptAt TEXT,
        lastError TEXT,
        metadata TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sentAt TEXT
      );
    `);
    console.log("✓ notification_deliveries table exists or created");

    // Create silences table if it doesn't exist
    console.log("Creating silences table...");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS silences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        silenceNamespace TEXT NOT NULL,
        silenceName TEXT NOT NULL,
        startsAt TEXT NOT NULL,
        endsAt TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✓ silences table exists or created");

    // Create maintenance_windows table if it doesn't exist
    console.log("Creating maintenance_windows table...");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS maintenance_windows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        windowNamespace TEXT NOT NULL,
        windowName TEXT NOT NULL,
        description TEXT,
        schedule TEXT NOT NULL,
        durationMinutes INTEGER NOT NULL,
        nextOccurrenceAt TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✓ maintenance_windows table exists or created");

    // Insert test LocalUser CRD (insert or ignore if already exists)
    console.log("Inserting test user...");
    const stmt = sqlite.prepare(`
      INSERT OR IGNORE INTO crd_cache (kind, apiVersion, namespace, name, generation, resourceVersion, spec)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const testUserSpec = JSON.stringify({
      username: "admin",
      role: "admin",
      // For testing, include the password hash directly (normally would use Kubernetes Secret)
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$ZaQHCABm87e4LWXVCDOI3g$mBthek8imn1/6gNNwe3Ts43ovjpobL66PKU257b0wkg",
      passwordHashSecretRef: {
        name: "admin-password",
        key: "hash",
      },
    });

    stmt.run(
      "LocalUser",
      "monitoring.kubekuma.io/v1",
      "default",
      "admin",
      1,
      "1",
      testUserSpec
    );
    console.log("✓ Test user seeded (inserted or already exists)");

    // Verify
    const rows = sqlite.prepare("SELECT * FROM crd_cache WHERE name = ? AND kind = ?").all("admin", "LocalUser");
    console.log("✓ Verification - Found", rows.length, "test user(s)");

    sqlite.close();
    console.log("Seed complete");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    sqlite.close();
    process.exit(1);
  }
}

seedTestData().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
