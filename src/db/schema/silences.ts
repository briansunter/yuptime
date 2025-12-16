import { sql } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pgTable, timestamp, varchar, integer } from "drizzle-orm/pg-core";
import { config } from "../../lib/config";

const isPostgres = config.isPostgres;

// Silence represents a temporary suppression of alerts
export const silences = isPostgres
  ? pgTable("silences", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      silenceNamespace: varchar("silenceNamespace").notNull(),
      silenceName: varchar("silenceName").notNull(),
      startsAt: timestamp("startsAt").notNull(),
      endsAt: timestamp("endsAt").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    })
  : sqliteTable("silences", {
      id: int("id").primaryKey({ autoIncrement: true }),
      silenceNamespace: text("silenceNamespace").notNull(),
      silenceName: text("silenceName").notNull(),
      startsAt: text("startsAt").notNull(),
      endsAt: text("endsAt").notNull(),
      createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
      updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    });

export type Silence = typeof silences.$inferSelect;
export type NewSilence = typeof silences.$inferInsert;

// MaintenanceWindow represents scheduled downtime suppression
export const maintenanceWindows = isPostgres
  ? pgTable("maintenance_windows", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      windowNamespace: varchar("windowNamespace").notNull(),
      windowName: varchar("windowName").notNull(),
      description: varchar("description"),
      schedule: varchar("schedule").notNull(), // RRULE format
      durationMinutes: integer("durationMinutes").notNull(),
      nextOccurrenceAt: timestamp("nextOccurrenceAt"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    })
  : sqliteTable("maintenance_windows", {
      id: int("id").primaryKey({ autoIncrement: true }),
      windowNamespace: text("windowNamespace").notNull(),
      windowName: text("windowName").notNull(),
      description: text("description"),
      schedule: text("schedule").notNull(), // RRULE format
      durationMinutes: int("durationMinutes").notNull(),
      nextOccurrenceAt: text("nextOccurrenceAt"),
      createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
      updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    });

export type MaintenanceWindow = typeof maintenanceWindows.$inferSelect;
export type NewMaintenanceWindow = typeof maintenanceWindows.$inferInsert;
