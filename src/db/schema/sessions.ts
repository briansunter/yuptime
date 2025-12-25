/**
 * Sessions table for JWT session tracking and revocation
 * Supports both SQLite and PostgreSQL
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  text as pgText,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";
import { config } from "../../lib/config";

// Determine which schema to use based on database type
const usePostgres = config.isPostgres;

export const sessions = usePostgres
  ? pgTable("sessions", {
      id: varchar("id").primaryKey(), // UUID v4
      userId: varchar("userId").notNull(), // Format: namespace/name (LocalUser identifier)
      username: varchar("username").notNull(),
      role: varchar("role").notNull(), // admin, editor, viewer
      tokenHash: varchar("tokenHash").notNull(), // SHA-256 hash of JWT for revocation
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      expiresAt: timestamp("expiresAt").notNull(),
      lastActivityAt: timestamp("lastActivityAt").defaultNow().notNull(),
      ipAddress: varchar("ipAddress"),
      userAgent: pgText("userAgent"),
    })
  : sqliteTable("sessions", {
      id: sqliteText("id").primaryKey(), // UUID v4
      userId: sqliteText("userId").notNull(), // Format: namespace/name (LocalUser identifier)
      username: sqliteText("username").notNull(),
      role: sqliteText("role").notNull(), // admin, editor, viewer
      tokenHash: sqliteText("tokenHash").notNull(), // SHA-256 hash of JWT for revocation
      createdAt: sqliteText("createdAt")
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
      expiresAt: sqliteText("expiresAt").notNull(),
      lastActivityAt: sqliteText("lastActivityAt")
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
      ipAddress: sqliteText("ipAddress"),
      userAgent: sqliteText("userAgent"),
    });

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
