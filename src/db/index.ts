import { Database } from "bun:sqlite";
import path from "node:path";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { logger } from "../lib/logger";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL || "sqlite:./kubekuma.db";
const isPostgres = databaseUrl.startsWith("postgresql://");

/**
 * Database instance type - uses SQLite type as base since Drizzle ORM
 * doesn't provide a common interface for SQLite and PostgreSQL.
 * The PostgreSQL driver is compatible at runtime.
 */
type DatabaseInstance = BunSQLiteDatabase<typeof schema>;

let db: DatabaseInstance | null = null;
let sqliteDb: Database | null = null;

/**
 * SQLite schema creation SQL
 * Auto-creates tables if they don't exist on startup
 */
const SQLITE_SCHEMA = `
-- CRD Cache table
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
CREATE INDEX IF NOT EXISTS idx_crd_cache_kind ON crd_cache(kind);
CREATE INDEX IF NOT EXISTS idx_crd_cache_ns_name ON crd_cache(namespace, name);

-- Sessions table
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
CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
CREATE INDEX IF NOT EXISTS idx_sessions_tokenHash ON sessions(tokenHash);

-- Heartbeats table
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
CREATE INDEX IF NOT EXISTS idx_heartbeats_monitorId ON heartbeats(monitorId);
CREATE INDEX IF NOT EXISTS idx_heartbeats_checkedAt ON heartbeats(checkedAt);

-- Incidents table
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
CREATE INDEX IF NOT EXISTS idx_incidents_monitorId ON incidents(monitorId);
CREATE INDEX IF NOT EXISTS idx_incidents_state ON incidents(state);

-- Notification deliveries table
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
CREATE INDEX IF NOT EXISTS idx_notif_del_status ON notification_deliveries(status);

-- Silences table
CREATE TABLE IF NOT EXISTS silences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  silenceNamespace TEXT NOT NULL,
  silenceName TEXT NOT NULL,
  startsAt TEXT NOT NULL,
  endsAt TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Maintenance windows table
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

-- Audit events table
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
CREATE INDEX IF NOT EXISTS idx_audit_resourceKey ON audit_events(resourceKey);
`;

export async function initializeDatabase() {
  if (isPostgres) {
    const client = postgres(databaseUrl);
    // Cast to SQLite type - Drizzle ORM APIs are compatible at runtime
    db = drizzlePostgres(client, { schema }) as unknown as DatabaseInstance;
  } else {
    let file = databaseUrl;

    // Remove sqlite: prefix if present
    if (file.startsWith("sqlite://")) {
      file = file.slice("sqlite://".length);
    } else if (file.startsWith("sqlite:")) {
      file = file.slice("sqlite:".length);
    }

    // Make path absolute if relative
    if (!path.isAbsolute(file)) {
      file = path.resolve(process.cwd(), file);
    }

    logger.info({ file }, "Opening SQLite database");
    // Use file-based database for persistence
    sqliteDb = new Database(file);

    // Auto-create schema if tables don't exist
    logger.debug("Ensuring SQLite schema exists...");
    sqliteDb.exec(SQLITE_SCHEMA);
    logger.info("SQLite schema ready");

    db = drizzle(sqliteDb, { schema });
  }
  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return db;
}

export function getRawSqliteDatabase() {
  if (!sqliteDb) {
    throw new Error("SQLite database not initialized or using PostgreSQL.");
  }
  return sqliteDb;
}

export type DbInstance = typeof db;
export { schema };
