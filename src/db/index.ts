import { drizzle } from "drizzle-orm/bun-sqlite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { Database } from "bun:sqlite";
import postgres from "postgres";
import path from "path";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL || "sqlite:./kubekuma.db";
const isPostgres = databaseUrl.startsWith("postgresql://");

let db: any;
let sqliteDb: Database | null = null;

export async function initializeDatabase() {
  if (isPostgres) {
    const client = postgres(databaseUrl);
    db = drizzlePostgres(client, { schema });
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

    console.log("Opening SQLite database at:", file);
    // Use file-based database for persistence
    sqliteDb = new Database(file);
    db = drizzle(sqliteDb, { schema });
  }
  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}

export function getRawSqliteDatabase() {
  if (!sqliteDb) {
    throw new Error("SQLite database not initialized or using PostgreSQL.");
  }
  return sqliteDb;
}

export type Database = typeof db;
export { schema };
