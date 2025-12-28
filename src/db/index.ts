/**
 * Database Initialization
 * Supports SQLite, PostgreSQL (via Drizzle), and etcd
 */

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../lib/config";
import { logger } from "../lib/logger";
import * as schema from "./schema";

// Database type uses 'any' because:
// 1. etcd and Drizzle (SQLite/Postgres) have different APIs
// 2. etcd uses db.heartbeats().method() style
// 3. Drizzle uses db.select().from(table) style
// Runtime code handles the correct implementation
type DrizzleDb = any;

let db: DrizzleDb | null = null;
let sqliteConnection: Database | null = null;
let pgConnection: ReturnType<typeof postgres> | null = null;

/**
 * Initialize database connection based on config
 */
export async function initializeDatabase(): Promise<DrizzleDb> {
  if (db) {
    logger.warn("Database already initialized");
    return db;
  }

  if (config.dbType === "etcd") {
    // For etcd mode, we use the etcd client directly
    // Import dynamically to avoid loading when not needed
    const { EtcdDatabase } = await import("../db-etcd/client");
    const etcdEndpoints = config.etcdEndpoints || "http://etcd:2379";
    logger.info({ etcdEndpoints }, "Initializing etcd database connection...");
    const etcdDb = new EtcdDatabase(etcdEndpoints);
    await etcdDb.initialize();
    logger.info("etcd database connection established");
    // Return etcd as any since it has different interface
    return etcdDb as any;
  }

  if (config.isPostgres) {
    logger.info("Initializing PostgreSQL database connection...");
    pgConnection = postgres(config.databaseUrl);
    db = drizzlePg(pgConnection, { schema });
    logger.info("PostgreSQL database connection established");
  } else {
    // SQLite - extract path from URL (sqlite:./path or sqlite:/path)
    const sqlitePath = config.databaseUrl.replace(/^sqlite:/, "");
    logger.info({ path: sqlitePath }, "Initializing SQLite database...");
    sqliteConnection = new Database(sqlitePath, { create: true });
    db = drizzle(sqliteConnection, { schema });
    logger.info("SQLite database connection established");
  }

  return db;
}

/**
 * Get database instance
 * @throws Error if database not initialized
 */
export function getDatabase(): DrizzleDb {
  if (!db) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return db;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (sqliteConnection) {
    sqliteConnection.close();
    sqliteConnection = null;
  }
  if (pgConnection) {
    await pgConnection.end();
    pgConnection = null;
  }
  db = null;
  logger.info("Database connection closed");
}

export type DbInstance = DrizzleDb;
export { schema };
