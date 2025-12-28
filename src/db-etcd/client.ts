/**
 * etcd-based Database Client
 * Provides drop-in replacement for Drizzle ORM using etcd as the backend
 */

import { getTableName as drizzleGetTableName, is, Table } from "drizzle-orm";
import { Etcd3 } from "etcd3";
import { v4 as uuidv4 } from "uuid";
import type {
  CrdCache,
  Heartbeat,
  Incident,
  NotificationDelivery,
} from "../db/schema";
import { logger } from "../lib/logger";

// Re-export types for compatibility
export type {
  AuditEvent,
  CrdCache,
  Heartbeat,
  Incident,
  MaintenanceWindow,
  NotificationDelivery,
  Session,
  Silence,
} from "../db/schema";

// Re-export schema tables for Drizzle compatibility
export * from "../db/schema";

export class EtcdDatabase {
  private client: Etcd3;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: tracks connection state for future health checks
  private isConnected = false;

  constructor(connectionString?: string) {
    // Connect to Kubernetes etcd by default
    const hosts =
      connectionString ||
      process.env.ETCD_ENDPOINTS ||
      "https://kubernetes.default.svc:2379";

    this.client = new Etcd3({
      hosts: Array.isArray(hosts) ? hosts : hosts.split(","),
      grpcOptions: {
        "grpc.max_send_message_length": 10 * 1024 * 1024, // 10MB
        "grpc.max_receive_message_length": 10 * 1024 * 1024, // 10MB
        "grpc.keepalive_time_ms": 10000, // 10 seconds
        "grpc.keepalive_timeout_ms": 5000, // 5 seconds
      },
    });
  }

  async initialize(): Promise<void> {
    try {
      // Test connection by getting etcd status
      await this.client.maintenance.status();
      this.isConnected = true;
      logger.info("etcd database connection established");
    } catch (error) {
      logger.error({ error }, "Failed to connect to etcd");
      throw error;
    }
  }

  async close(): Promise<void> {
    this.client.close();
    this.isConnected = false;
    logger.info("etcd database connection closed");
  }

  // Heartbeat operations
  heartbeats() {
    return new HeartbeatOperations(this.client);
  }

  // Incident operations
  incidents() {
    return new IncidentOperations(this.client);
  }

  // Notification delivery operations
  notifications() {
    return new NotificationOperations(this.client);
  }

  // CRD cache operations
  crdCache() {
    return new CrdCacheOperations(this.client);
  }

  // Get raw etcd client for advanced operations
  getRawClient(): Etcd3 {
    return this.client;
  }

  // Helper to detect drizzle table names
  private getTableName(t: any): string {
    if (typeof t === "string") return t;

    // Use drizzle-orm's built-in getTableName function
    if (is(t, Table)) {
      try {
        return drizzleGetTableName(t);
      } catch {
        // Fall through to other detection methods
      }
    }

    // Drizzle tables have _ with name property or Symbol for table name
    if (t?._?.name) return t._.name;
    if (t?.name) return t.name;

    // Check for common drizzle internal symbols
    const symbols = Object.getOwnPropertySymbols(t);
    for (const sym of symbols) {
      const desc = sym.description || "";
      if (
        desc.includes("drizzle") ||
        desc.includes("Table") ||
        desc.includes("Name")
      ) {
        const val = t[sym];
        if (typeof val === "string") return val;
        if (val?.name) return val.name;
      }
    }

    return "";
  }

  // Drizzle-compatible API - direct operations
  select(table?: any) {
    // If no table provided, return a generic query that can be chained with .from()
    if (!table) {
      return {
        from: (t: any) => {
          const tableName = this.getTableName(t);
          if (tableName === "heartbeats") return this.heartbeats().select();
          if (tableName === "incidents") return this.incidents().select();
          if (tableName === "notification_deliveries")
            return this.notifications().select();
          if (tableName === "crd_cache") return this.crdCache().select();
          throw new Error(`Unknown table: ${tableName || t}`);
        },
      };
    }

    const tableName = this.getTableName(table);
    // Dispatch to appropriate table operations
    if (tableName === "heartbeats") {
      return this.heartbeats().select();
    }
    if (tableName === "incidents") {
      return this.incidents().select();
    }
    if (tableName === "notification_deliveries") {
      return this.notifications().select();
    }
    if (tableName === "crd_cache") {
      return this.crdCache().select();
    }
    throw new Error(`Unknown table: ${tableName || table}`);
  }

  insert(table: any) {
    const tableName = this.getTableName(table);

    // Returns insert helper
    const insertObj = {
      values: async (data: any) => {
        if (tableName === "heartbeats") {
          await this.heartbeats().insert(data);
        } else if (tableName === "incidents") {
          await this.incidents().insert(data);
        } else if (tableName === "notification_deliveries") {
          await this.notifications().insert(data);
        } else if (tableName === "crd_cache") {
          await this.crdCache().upsert(data);
        } else {
          throw new Error(`Unknown table: ${tableName || table}`);
        }
        return insertObj;
      },
      returning: () => ({
        exec: async () => [],
      }),
    };
    return insertObj;
  }

  update(table: any) {
    const tableName = this.getTableName(table);
    // Returns update helper
    return {
      set: (data: any) => ({
        where: (predicate: any) => ({
          exec: async () => {
            if (tableName === "incidents") {
              // Extract ID from predicate
              const incidentId = predicate?.value?.id || predicate?.id;
              if (!incidentId)
                throw new Error("Incident ID required for update");
              await this.incidents().update(incidentId, data);
            } else {
              throw new Error(
                `Update not supported for table: ${tableName || table}`,
              );
            }
          },
        }),
      }),
    };
  }

  delete(table: any) {
    const tableName = this.getTableName(table);
    // Returns delete helper
    return {
      where: (predicate: any) => ({
        exec: async () => {
          // Handle delete operations
          if (tableName === "crd_cache") {
            const kind = predicate?.kind;
            const namespace = predicate?.namespace;
            const name = predicate?.name;
            if (kind && namespace && name) {
              await this.crdCache().delete(kind, namespace, name);
            }
          } else {
            throw new Error(`Delete not supported for table: ${table}`);
          }
        },
      }),
    };
  }
}

/**
 * Heartbeat Operations
 */
class HeartbeatOperations {
  constructor(private client: Etcd3) {}

  /**
   * Insert a new heartbeat
   */
  async insert(data: NewHeartbeat): Promise<void> {
    const sequenceId = uuidv4();
    const key = `/yuptime/heartbeats/${data.monitorId}/${data.checkedAt}/${sequenceId}`;
    const value = JSON.stringify(data);

    // Store main heartbeat record (no TTL for now - can add compaction later)
    await this.client.put(key).value(value).exec();

    // Update latest heartbeat index (no TTL - always keep latest)
    await this.client
      .put(`/yuptime/index/heartbeat/latest/${data.monitorId}`)
      .value(value)
      .exec();

    // Update state-based index for uptime calculations
    await this.client
      .put(
        `/yuptime/index/heartbeat/state/${data.monitorId}/${data.state}/${data.checkedAt}`,
      )
      .value(value)
      .exec();

    logger.debug({ monitorId: data.monitorId }, "Heartbeat inserted to etcd");
  }

  /**
   * Query builder for heartbeats
   */
  select(): HeartbeatQuery {
    return new HeartbeatQuery(this.client);
  }

  /**
   * Get latest heartbeat for a monitor (O(1) lookup)
   */
  async getLatest(monitorId: string): Promise<Heartbeat | null> {
    const key = `/yuptime/index/heartbeat/latest/${monitorId}`;
    const result = await this.client.get(key);

    if (!result) return null;

    const heartbeat = JSON.parse(result.toString()) as Heartbeat;
    return heartbeat;
  }

  /**
   * Get previous heartbeat for state transition detection
   */
  async getPrevious(monitorId: string): Promise<Heartbeat | null> {
    const prefix = `/yuptime/heartbeats/${monitorId}/`;

    // Get all heartbeats, sorted by key (which includes timestamp)
    const result = await this.client
      .getAll()
      .prefix(prefix)
      .sort("Key", "Descend")
      .limit(2)
      .exec();

    if (!result.kvs || result.kvs.length < 2) return null;

    // Get second-to-last heartbeat (most recent minus one)
    const previous = JSON.parse(
      result.kvs[result.kvs.length - 2].value!.toString(),
    ) as Heartbeat;
    return previous;
  }
}

/**
 * Heartbeat Query Builder
 * Mimics Drizzle ORM query syntax for compatibility
 */
class HeartbeatQuery {
  private client: Etcd3;
  private whereMonitorId: string | null = null;
  private whereState: string | null = null;
  private whereCheckedAtGte: string | null = null;
  private orderByField: "checkedAt" | null = null;
  private orderDir: "asc" | "desc" = "asc";
  private limitCount: number | null = null;
  private groupByState: boolean = false;
  private _cachedResult: Heartbeat[] | null = null;

  constructor(client: Etcd3) {
    this.client = client;
  }

  from(_table: any): this {
    // Drizzle compatibility - ignore table name since we already know it
    return this;
  }

  where(predicate: any): this {
    // Parse eq(heartbeats.monitorId, value)
    if (predicate?.field === "monitorId") {
      this.whereMonitorId = predicate.value;
    }
    // Parse eq(heartbeats.state, value)
    if (predicate?.field === "state") {
      this.whereState = predicate.value;
    }
    // Parse gte(heartbeats.checkedAt, value)
    if (predicate?.op === "gte" || predicate?.op === "gt") {
      this.whereCheckedAtGte = predicate.value;
    }
    // Handle AND conditions
    if (predicate?.type === "and") {
      for (const pred of predicate.predicates) {
        this.where(pred);
      }
    }
    return this;
  }

  orderBy(field: any): this {
    if (field?.field === "checkedAt" || field === "checkedAt") {
      this.orderByField = "checkedAt";
    }
    if (field?.dir === "desc" || field === "desc") {
      this.orderDir = "desc";
    }
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  groupBy(field: string): this {
    if (field === "state") {
      this.groupByState = true;
    }
    return this;
  }

  // Array-like convenience properties
  get length(): Promise<number> {
    return this.execute().then((arr) => arr.length);
  }

  async execute(): Promise<Heartbeat[]> {
    if (this._cachedResult) {
      return this._cachedResult;
    }

    const result = await this._execute();
    this._cachedResult = result;
    return result;
  }

  private async _execute(): Promise<Heartbeat[]> {
    // Optimization: Use latest index for single latest heartbeat query
    if (
      this.whereMonitorId &&
      this.limitCount === 1 &&
      this.orderDir === "desc" &&
      !this.groupByState
    ) {
      const key = `/yuptime/index/heartbeat/latest/${this.whereMonitorId}`;
      const result = await this.client.get(key);

      if (!result) return [];

      const heartbeat = JSON.parse(result.toString()) as Heartbeat;

      // Apply state filter if present
      if (this.whereState && heartbeat.state !== this.whereState) {
        return [];
      }

      return [heartbeat];
    }

    // For grouping by state (uptime calculations)
    if (this.groupByState && this.whereMonitorId) {
      return await this.executeGroupByState();
    }

    // Default: Scan heartbeats
    return await this.executeScan();
  }

  private async executeScan(): Promise<Heartbeat[]> {
    let heartbeats: Heartbeat[] = [];

    if (this.whereMonitorId) {
      const prefix = `/yuptime/heartbeats/${this.whereMonitorId}/`;
      const result = await this.client.getAll().prefix(prefix).exec();

      if (result.kvs) {
        for (const kv of result.kvs) {
          heartbeats.push(JSON.parse(kv.value.toString()) as Heartbeat);
        }
      }
    } else {
      // Scan all heartbeats (not recommended for performance)
      const prefix = "/yuptime/heartbeats/";
      const result = await this.client.getAll().prefix(prefix).exec();

      if (result.kvs) {
        for (const kv of result.kvs) {
          heartbeats.push(JSON.parse(kv.value.toString()) as Heartbeat);
        }
      }
    }

    // Apply filters
    if (this.whereState) {
      heartbeats = heartbeats.filter((hb) => hb.state === this.whereState);
    }

    if (this.whereCheckedAtGte) {
      const date = new Date(this.whereCheckedAtGte);
      heartbeats = heartbeats.filter((hb) => {
        const hbDate = new Date(hb.checkedAt);
        return hbDate >= date;
      });
    }

    // Apply sorting
    if (this.orderByField === "checkedAt") {
      heartbeats.sort((a, b) => {
        const comparison = (a.checkedAt as string).localeCompare(
          b.checkedAt as string,
        );
        return this.orderDir === "desc" ? -comparison : comparison;
      });
    }

    // Apply limit
    if (this.limitCount) {
      heartbeats = heartbeats.slice(0, this.limitCount);
    }

    return heartbeats;
  }

  private async executeGroupByState(): Promise<any[]> {
    if (!this.whereMonitorId) {
      throw new Error("GROUP BY state requires monitorId filter");
    }

    const prefix = `/yuptime/index/heartbeat/state/${this.whereMonitorId}/`;
    const result = await this.client.getAll().prefix(prefix).exec();

    const stateCounts: Record<string, number> = {};
    let _totalChecks = 0;

    if (result.kvs) {
      for (const kv of result.kvs) {
        // Extract state and timestamp from key
        // Key format: /yuptime/index/heartbeat/state/{monitorId}/{state}/{timestamp}
        const keyParts = kv.key.toString().split("/");
        const state = keyParts[keyParts.length - 2];
        const timestamp = keyParts[keyParts.length - 1];

        // Filter by time range if specified
        if (this.whereCheckedAtGte && timestamp < this.whereCheckedAtGte) {
          continue;
        }

        stateCounts[state] = (stateCounts[state] || 0) + 1;
        _totalChecks++;
      }
    }

    // Return in format similar to SQL GROUP BY
    return Object.entries(stateCounts).map(([state, count]) => ({
      state,
      count,
    }));
  }

  // Array-like methods
  async map<T>(fn: (item: Heartbeat, index: number) => T): Promise<T[]> {
    const results = await this.execute();
    return results.map(fn);
  }

  async find(fn: (item: Heartbeat) => boolean): Promise<Heartbeat | undefined> {
    const results = await this.execute();
    return results.find(fn);
  }

  async filter(fn: (item: Heartbeat) => boolean): Promise<Heartbeat[]> {
    const results = await this.execute();
    return results.filter(fn);
  }

  async [Symbol.asyncIterator](): Promise<AsyncIterableIterator<Heartbeat>> {
    const results = await this.execute();
    return (async function* () {
      for (const item of results) {
        yield item;
      }
    })();
  }
}

/**
 * Incident Operations
 */
class IncidentOperations {
  constructor(private client: Etcd3) {}

  async insert(data: any): Promise<number> {
    const incidentId = data.id || Date.now();
    const key = `/yuptime/incidents/${incidentId}`;
    const value = JSON.stringify({ ...data, id: incidentId });

    await this.client.put(key).value(value).exec();

    // Update active incident index if state is 'down'
    if (data.state === "down") {
      await this.client
        .put(`/yuptime/index/incident/active/${data.monitorId}`)
        .value(incidentId.toString())
        .exec();
    }

    logger.debug(
      { incidentId, monitorId: data.monitorId },
      "Incident inserted to etcd",
    );
    return incidentId;
  }

  async update(incidentId: number, data: Partial<Incident>): Promise<void> {
    const key = `/yuptime/incidents/${incidentId}`;

    // Get existing incident
    const result = await this.client.get(key);
    if (!result) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const existing = JSON.parse(result.toString()) as Incident;
    const updated = { ...existing, ...data };

    await this.client.put(key).value(JSON.stringify(updated)).exec();

    // Update active incident index
    if (updated.state === "down") {
      await this.client
        .put(`/yuptime/index/incident/active/${updated.monitorId}`)
        .value(incidentId.toString())
        .exec();
    } else {
      // Remove from active index if resolved
      await this.client
        .delete()
        .key(`/yuptime/index/incident/active/${updated.monitorId}`)
        .exec();
    }

    logger.debug({ incidentId }, "Incident updated in etcd");
  }

  /**
   * Get active incident for a monitor (O(1) lookup)
   */
  async getActive(monitorId: string): Promise<Incident | null> {
    const key = `/yuptime/index/incident/active/${monitorId}`;
    const result = await this.client.get(key);

    if (!result) return null;

    const incidentId = result.toString();

    // Fetch full incident
    const incidentKey = `/yuptime/incidents/${incidentId}`;
    const incidentResult = await this.client.get(incidentKey);

    if (!incidentResult) return null;

    return JSON.parse(incidentResult.toString()) as Incident;
  }

  select(): IncidentQuery {
    return new IncidentQuery(this.client);
  }
}

/**
 * Incident Query Builder
 */
class IncidentQuery {
  private client: Etcd3;
  private whereMonitorId: string | null = null;
  private whereState: string | null = null;
  private limitCount: number | null = null;
  private orderByField: string | null = null;
  private orderDir: "asc" | "desc" = "desc";
  private _cachedResult: Incident[] | null = null;

  constructor(client: Etcd3) {
    this.client = client;
  }

  from(_table: any): this {
    return this;
  }

  where(predicate: any): this {
    if (predicate?.field === "monitorId") {
      this.whereMonitorId = predicate.value;
    }
    if (predicate?.field === "state") {
      this.whereState = predicate.value;
    }
    return this;
  }

  orderBy(field: any): this {
    if (field?.field === "startedAt" || field === "startedAt") {
      this.orderByField = "startedAt";
    }
    if (field?.dir === "desc" || field === "desc") {
      this.orderDir = "desc";
    }
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  // Array-like convenience properties
  get length(): Promise<number> {
    return this.execute().then((arr) => arr.length);
  }

  async execute(): Promise<Incident[]> {
    if (this._cachedResult) {
      return this._cachedResult;
    }

    const result = await this._execute();
    this._cachedResult = result;
    return result;
  }

  private async _execute(): Promise<Incident[]> {
    // Optimization: Use active index for active incident lookup
    if (this.whereMonitorId && this.whereState === "down") {
      const incident = await this.client.get(
        `/yuptime/index/incident/active/${this.whereMonitorId}`,
      );
      if (!incident) return [];

      const incidentId = incident.toString();
      const result = await this.client.get(`/yuptime/incidents/${incidentId}`);
      if (!result) return [];

      return [JSON.parse(result.toString()) as Incident];
    }

    // Default: Scan all incidents
    const prefix = "/yuptime/incidents/";
    const result = await this.client.getAll().prefix(prefix).exec();

    const incidents: Incident[] = [];
    if (result.kvs) {
      for (const kv of result.kvs) {
        incidents.push(JSON.parse(kv.value.toString()) as Incident);
      }
    }

    // Apply filters
    if (this.whereMonitorId) {
      return incidents.filter((inc) => inc.monitorId === this.whereMonitorId);
    }
    if (this.whereState) {
      return incidents.filter((inc) => inc.state === this.whereState);
    }

    // Apply sorting
    if (this.orderByField === "startedAt") {
      incidents.sort((a, b) => {
        const comparison = (a.startedAt as string).localeCompare(
          b.startedAt as string,
        );
        return this.orderDir === "desc" ? -comparison : comparison;
      });
    }

    // Apply limit
    if (this.limitCount) {
      incidents.splice(this.limitCount);
    }

    return incidents;
  }

  // Array-like methods
  async map<T>(fn: (item: Incident, index: number) => T): Promise<T[]> {
    const results = await this.execute();
    return results.map(fn);
  }

  async find(fn: (item: Incident) => boolean): Promise<Incident | undefined> {
    const results = await this.execute();
    return results.find(fn);
  }

  async filter(fn: (item: Incident) => boolean): Promise<Incident[]> {
    const results = await this.execute();
    return results.filter(fn);
  }

  groupBy(_field: string): this {
    // Not implemented for incidents
    return this;
  }
}

/**
 * Notification Delivery Operations
 */
class NotificationOperations {
  constructor(private client: Etcd3) {}

  async insert(data: any): Promise<void> {
    const key = `/yuptime/deliveries/${data.monitorId}/${data.policyName}/${data.sentAt}/${uuidv4()}`;
    const value = JSON.stringify(data);

    await this.client.put(key).value(value).exec();

    logger.debug(
      { monitorId: data.monitorId, policyName: data.policyName },
      "Notification delivery inserted to etcd",
    );
  }

  /**
   * Check if notifications are rate limited
   */
  async isRateLimited(
    monitorId: string,
    policyName: string,
    windowStart: Date,
  ): Promise<boolean> {
    const windowStartIso = windowStart.toISOString();
    const prefix = `/yuptime/deliveries/${monitorId}/${policyName}/`;

    const result = await this.client.getAll().prefix(prefix).exec();

    // Check for sent notifications within the rate limit window
    if (result.kvs) {
      for (const kv of result.kvs) {
        const delivery = JSON.parse(
          kv.value.toString(),
        ) as NotificationDelivery;

        if (
          delivery.status === "sent" &&
          delivery.sentAt &&
          delivery.sentAt >= windowStartIso
        ) {
          return true; // Found recent delivery, rate limited
        }
      }
    }

    return false;
  }

  select(): NotificationQuery {
    return new NotificationQuery(this.client);
  }
}

/**
 * Notification Query Builder
 */
class NotificationQuery {
  private client: Etcd3;
  private whereMonitorId: string | null = null;
  private wherePolicyName: string | null = null;
  private whereStatus: string | null = null;
  private _cachedResult: NotificationDelivery[] | null = null;

  constructor(client: Etcd3) {
    this.client = client;
  }

  from(_table: any): this {
    return this;
  }

  where(predicate: any): this {
    if (predicate?.field === "monitorId") {
      this.whereMonitorId = predicate.value;
    }
    if (predicate?.field === "policyName") {
      this.wherePolicyName = predicate.value;
    }
    if (predicate?.field === "status") {
      this.whereStatus = predicate.value;
    }
    return this;
  }

  orderBy(_field: any): this {
    // Not implemented for notifications
    return this;
  }

  limit(_count: number): this {
    // Not implemented for notifications
    return this;
  }

  groupBy(_field: string): this {
    // Not implemented for notifications
    return this;
  }

  // Array-like convenience properties
  get length(): Promise<number> {
    return this.execute().then((arr) => arr.length);
  }

  async execute(): Promise<NotificationDelivery[]> {
    if (this._cachedResult) {
      return this._cachedResult;
    }

    let prefix = "/yuptime/deliveries/";

    if (this.whereMonitorId && this.wherePolicyName) {
      prefix = `/yuptime/deliveries/${this.whereMonitorId}/${this.wherePolicyName}/`;
    } else if (this.whereMonitorId) {
      prefix = `/yuptime/deliveries/${this.whereMonitorId}/`;
    }

    const result = await this.client.getAll().prefix(prefix).exec();

    const deliveries: NotificationDelivery[] = [];
    if (result.kvs) {
      for (const kv of result.kvs) {
        deliveries.push(
          JSON.parse(kv.value.toString()) as NotificationDelivery,
        );
      }
    }

    // Apply additional filters
    if (this.whereStatus) {
      const filtered = deliveries.filter((d) => d.status === this.whereStatus);
      this._cachedResult = filtered;
      return filtered;
    }

    this._cachedResult = deliveries;
    return deliveries;
  }

  // Array-like methods
  async map<T>(
    fn: (item: NotificationDelivery, index: number) => T,
  ): Promise<T[]> {
    const results = await this.execute();
    return results.map(fn);
  }

  async find(
    fn: (item: NotificationDelivery) => boolean,
  ): Promise<NotificationDelivery | undefined> {
    const results = await this.execute();
    return results.find(fn);
  }

  async filter(
    fn: (item: NotificationDelivery) => boolean,
  ): Promise<NotificationDelivery[]> {
    const results = await this.execute();
    return results.filter(fn);
  }
}

/**
 * CRD Cache Operations
 */
class CrdCacheOperations {
  constructor(private client: Etcd3) {}

  async upsert(data: CrdCache): Promise<void> {
    const key = `/yuptime/crd/${data.kind}/${data.namespace}/${data.name}`;
    const value = JSON.stringify(data);

    await this.client.put(key).value(value).exec();

    logger.debug(
      { kind: data.kind, namespace: data.namespace, name: data.name },
      "CRD cache updated in etcd",
    );
  }

  async delete(kind: string, namespace: string, name: string): Promise<void> {
    const key = `/yuptime/crd/${kind}/${namespace}/${name}`;
    await this.client.delete().key(key).exec();
  }

  /**
   * Get CRD by kind, namespace, name (O(1) lookup)
   */
  async get(
    kind: string,
    namespace: string,
    name: string,
  ): Promise<CrdCache | null> {
    const key = `/yuptime/crd/${kind}/${namespace}/${name}`;
    const result = await this.client.get(key);

    if (!result) return null;

    return JSON.parse(result.toString()) as CrdCache;
  }

  /**
   * Get all CRDs of a specific kind
   */
  async getByKind(kind: string): Promise<CrdCache[]> {
    const prefix = `/yuptime/crd/${kind}/`;
    const result = await this.client.getAll().prefix(prefix).exec();

    const crds: CrdCache[] = [];
    if (result.kvs) {
      for (const kv of result.kvs) {
        crds.push(JSON.parse(kv.value.toString()) as CrdCache);
      }
    }

    return crds;
  }

  select(): CrdCacheQuery {
    return new CrdCacheQuery(this.client);
  }
}

/**
 * CRD Cache Query Builder
 */
class CrdCacheQuery {
  private client: Etcd3;
  private whereKind: string | null = null;
  private whereNamespace: string | null = null;
  private whereName: string | null = null;

  constructor(client: Etcd3) {
    this.client = client;
  }

  from(_table: any): this {
    return this;
  }

  where(predicate: any): this {
    if (predicate?.field === "kind") {
      this.whereKind = predicate.value;
    }
    if (predicate?.field === "namespace") {
      this.whereNamespace = predicate.value;
    }
    if (predicate?.field === "name") {
      this.whereName = predicate.value;
    }
    return this;
  }

  orderBy(_field: any): this {
    return this;
  }

  limit(_count: number): this {
    return this;
  }

  groupBy(_field: string): this {
    return this;
  }

  // Array-like convenience properties
  get length(): Promise<number> {
    return this.execute().then((arr) => arr.length);
  }

  async execute(): Promise<CrdCache[]> {
    // If all filters present, do direct lookup
    if (this.whereKind && this.whereNamespace && this.whereName) {
      const result = await this.client.get(
        `/yuptime/crd/${this.whereKind}/${this.whereNamespace}/${this.whereName}`,
      );
      if (!result) return [];
      return [JSON.parse(result.toString()) as CrdCache];
    }

    // If kind is specified, use kind prefix
    if (this.whereKind) {
      const prefix = `/yuptime/crd/${this.whereKind}/`;
      const result = await this.client.getAll().prefix(prefix).exec();

      const crds: CrdCache[] = [];
      if (result.kvs) {
        for (const kv of result.kvs) {
          crds.push(JSON.parse(kv.value.toString()) as CrdCache);
        }
      }

      // Apply additional filters
      if (this.whereNamespace) {
        return crds.filter((c) => c.namespace === this.whereNamespace);
      }
      if (this.whereName) {
        return crds.filter((c) => c.name === this.whereName);
      }

      return crds;
    }

    // Fallback: scan all CRDs
    const prefix = "/yuptime/crd/";
    const result = await this.client.getAll().prefix(prefix).exec();

    const crds: CrdCache[] = [];
    if (result.kvs) {
      for (const kv of result.kvs) {
        crds.push(JSON.parse(kv.value.toString()) as CrdCache);
      }
    }

    // Apply filters
    if (this.whereNamespace) {
      return crds.filter((c) => c.namespace === this.whereNamespace);
    }
    if (this.whereName) {
      return crds.filter((c) => c.name === this.whereName);
    }

    return crds;
  }

  // Array-like methods
  async map<T>(fn: (item: CrdCache, index: number) => T): Promise<T[]> {
    const results = await this.execute();
    return results.map(fn);
  }

  async find(fn: (item: CrdCache) => boolean): Promise<CrdCache | undefined> {
    const results = await this.execute();
    return results.find(fn);
  }

  async filter(fn: (item: CrdCache) => boolean): Promise<CrdCache[]> {
    const results = await this.execute();
    return results.filter(fn);
  }
}

// Type exports for New records
export type NewHeartbeat = Omit<Heartbeat, "id" | "createdAt">;
export type NewIncident = Omit<Incident, "id">;
export type NewNotificationDelivery = Omit<
  NotificationDelivery,
  "id" | "createdAt"
>;

// Query helper functions (mimic Drizzle)
export function eq<T>(field: keyof T | string, value: any) {
  return { field, value, op: "eq" };
}

export function and<_T>(...predicates: any[]) {
  return { type: "and", predicates };
}

export function desc(field: keyof any | string) {
  return { field, dir: "desc" as const };
}

export function gte<T>(field: keyof T | string, value: any) {
  return { field, value, op: "gte" };
}

export function gt<T>(field: keyof T | string, value: any) {
  return { field, value, op: "gt" };
}
