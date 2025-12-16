import { sql } from "drizzle-orm";
import { int, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pgTable, timestamp, varchar, numeric, serial, integer } from "drizzle-orm/pg-core";
import { config } from "../../lib/config";

// Detect driver based on centralized config
const isPostgres = config.isPostgres;

export const heartbeats = isPostgres
  ? pgTable("heartbeats", {
      id: serial("id").primaryKey(),
      monitorNamespace: varchar("monitorNamespace").notNull(),
      monitorName: varchar("monitorName").notNull(),
      monitorId: varchar("monitorId").notNull(), // namespace/name composite
      state: varchar("state", { enum: ["up", "down", "pending", "flapping", "paused"] }).notNull(),
      latencyMs: numeric("latencyMs"),
      reason: varchar("reason"),
      message: varchar("message"),
      checkedAt: timestamp("checkedAt").notNull(),
      attempts: integer("attempts").default(1),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
    })
  : sqliteTable("heartbeats", {
      id: int("id").primaryKey({ autoIncrement: true }),
      monitorNamespace: text("monitorNamespace").notNull(),
      monitorName: text("monitorName").notNull(),
      monitorId: text("monitorId").notNull(), // namespace/name composite
      state: text("state", { enum: ["up", "down", "pending", "flapping", "paused"] }).notNull(),
      latencyMs: real("latencyMs"),
      reason: text("reason"),
      message: text("message"),
      checkedAt: text("checkedAt").notNull(),
      attempts: int("attempts").default(1),
      createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    });

export type Heartbeat = typeof heartbeats.$inferSelect;
export type NewHeartbeat = typeof heartbeats.$inferInsert;
