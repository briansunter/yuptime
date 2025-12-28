import { sql } from "drizzle-orm";
import {
  json,
  integer as pgInteger,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { config } from "../../lib/config";

const isPostgres = config.isPostgres;

// Materialized view of CRD state from Kubernetes
// Used for fast queries without hitting the API server
export const crdCache = isPostgres
  ? pgTable("crd_cache", {
      id: serial("id").primaryKey(),
      kind: varchar("kind").notNull(), // Monitor, NotificationProvider, StatusPage, etc.
      apiVersion: varchar("apiVersion").notNull(), // monitoring.yuptime.io/v1
      namespace: varchar("namespace").notNull(),
      name: varchar("name").notNull(),
      generation: pgInteger("generation").notNull(), // spec generation for observedGeneration tracking
      resourceVersion: varchar("resourceVersion"), // for conflict detection
      spec: json("spec").notNull(), // Full spec as JSON
      status: json("status"), // Status subresource
      labels: json("labels"), // Kubernetes labels
      annotations: json("annotations"), // Kubernetes annotations
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    })
  : sqliteTable("crd_cache", {
      id: int("id").primaryKey({ autoIncrement: true }),
      kind: text("kind").notNull(), // Monitor, NotificationProvider, StatusPage, etc.
      apiVersion: text("apiVersion").notNull(), // monitoring.yuptime.io/v1
      namespace: text("namespace").notNull(),
      name: text("name").notNull(),
      generation: int("generation").notNull(), // spec generation for observedGeneration tracking
      resourceVersion: text("resourceVersion"), // for conflict detection
      spec: text("spec").notNull(), // Full spec as JSON string
      status: text("status"), // Status subresource as JSON string
      labels: text("labels"), // JSON stringified
      annotations: text("annotations"), // JSON stringified
      createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
      updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
    });

export type CrdCache = typeof crdCache.$inferSelect;
export type NewCrdCache = typeof crdCache.$inferInsert;
