import { sql } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pgTable, timestamp, varchar, boolean, integer } from "drizzle-orm/pg-core";
import { config } from "../../lib/config";

const isPostgres = config.isPostgres;

// Incident represents an open or closed outage event
export const incidents = isPostgres
  ? pgTable("incidents", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      monitorNamespace: varchar("monitorNamespace").notNull(),
      monitorName: varchar("monitorName").notNull(),
      monitorId: varchar("monitorId").notNull(),
      state: varchar("state", { enum: ["up", "down"] }).notNull(),
      startedAt: timestamp("startedAt").notNull(),
      endedAt: timestamp("endedAt"),
      duration: integer("duration"), // seconds, computed
      suppressed: boolean("suppressed").default(false),
      suppressReason: varchar("suppressReason"),
      acknowledged: boolean("acknowledged").default(false),
      acknowledgedAt: timestamp("acknowledgedAt"),
      acknowledgedBy: varchar("acknowledgedBy"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    })
  : sqliteTable("incidents", {
      id: int("id").primaryKey({ autoIncrement: true }),
      monitorNamespace: text("monitorNamespace").notNull(),
      monitorName: text("monitorName").notNull(),
      monitorId: text("monitorId").notNull(),
      state: text("state", { enum: ["up", "down"] }).notNull(),
      startedAt: text("startedAt").notNull(),
      endedAt: text("endedAt"),
      duration: int("duration"), // seconds, computed
      suppressed: int("suppressed").default(0), // SQLite uses 0/1 for boolean
      suppressReason: text("suppressReason"),
      acknowledged: int("acknowledged").default(0),
      acknowledgedAt: text("acknowledgedAt"),
      acknowledgedBy: text("acknowledgedBy"),
      createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
      updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    });

export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;
