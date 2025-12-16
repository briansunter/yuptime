import { sql } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pgTable, timestamp, varchar, json, integer } from "drizzle-orm/pg-core";
import { config } from "../../lib/config";

const isPostgres = config.isPostgres;

// Audit events for traceability
export const auditEvents = isPostgres
  ? pgTable("audit_events", {
      id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
      resourceType: varchar("resourceType").notNull(), // Monitor, NotificationProvider, etc.
      resourceKey: varchar("resourceKey").notNull(), // namespace/name
      eventType: varchar("eventType").notNull(), // created, updated, deleted, reconciled
      actor: varchar("actor"), // controller, user-id
      details: json("details"), // structured details
      changesSummary: varchar("changesSummary"), // human-readable summary
      createdAt: timestamp("createdAt").defaultNow().notNull(),
    })
  : sqliteTable("audit_events", {
      id: int("id").primaryKey({ autoIncrement: true }),
      resourceType: text("resourceType").notNull(), // Monitor, NotificationProvider, etc.
      resourceKey: text("resourceKey").notNull(), // namespace/name
      eventType: text("eventType").notNull(), // created, updated, deleted, reconciled
      actor: text("actor"), // controller, user-id
      details: text("details"), // JSON stringified
      changesSummary: text("changesSummary"), // human-readable summary
      createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    });

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
