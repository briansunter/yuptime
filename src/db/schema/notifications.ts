import { sql } from "drizzle-orm";
import {
  integer,
  json,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { config } from "../../lib/config";

const isPostgres = config.isPostgres;

// Notification delivery tracking
export const notificationDeliveries = isPostgres
  ? pgTable("notification_deliveries", {
      id: serial("id").primaryKey(),
      incidentId: integer("incidentId").notNull(),
      monitorId: varchar("monitorId").notNull(),
      policyName: varchar("policyName").notNull(),
      providerName: varchar("providerName").notNull(),
      providerType: varchar("providerType").notNull(), // slack, discord, smtp, etc.
      status: varchar("status", {
        enum: ["pending", "sent", "failed", "deduped"],
      }).notNull(),
      attempts: integer("attempts").default(0),
      lastAttemptAt: timestamp("lastAttemptAt"),
      lastError: varchar("lastError"),
      metadata: json("metadata"), // provider-specific data
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      sentAt: timestamp("sentAt"),
    })
  : sqliteTable("notification_deliveries", {
      id: int("id").primaryKey({ autoIncrement: true }),
      incidentId: int("incidentId").notNull(),
      monitorId: text("monitorId").notNull(),
      policyName: text("policyName").notNull(),
      providerName: text("providerName").notNull(),
      providerType: text("providerType").notNull(), // slack, discord, smtp, etc.
      status: text("status", {
        enum: ["pending", "sent", "failed", "deduped"],
      }).notNull(),
      attempts: int("attempts").default(0),
      lastAttemptAt: text("lastAttemptAt"),
      lastError: text("lastError"),
      metadata: text("metadata"), // JSON stringified
      createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
      sentAt: text("sentAt"),
    });

export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery =
  typeof notificationDeliveries.$inferInsert;
