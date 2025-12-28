#!/usr/bin/env bun
/**
 * Migrate from SQLite to etcd
 *
 * This script migrates existing data from SQLite to etcd.
 * If no SQLite database exists, it simply initializes etcd structure.
 */

import { EtcdDatabase } from '../src/db-etcd/client';
import { Database } from 'bun:sqlite';
import { drizzle, sql } from 'drizzle-orm/bun-sqlite';
import * as schema from '../src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { existsSync } from 'fs';
import path from 'path';

const SQLITE_DB = process.env.SQLITE_DB || 'data/kubekuma.db';
const ETCD_ENDPOINTS = process.env.ETCD_ENDPOINTS || 'https://kubernetes.default.svc:2379';

// Migration stats
let stats = {
	heartbeats: 0,
	incidents: 0,
	notifications: 0,
	crdCache: 0,
	total: 0,
};

/**
 * Check if SQLite database exists
 */
function sqliteExists(): boolean {
	return existsSync(SQLITE_DB);
}

/**
 * Migrate heartbeats from SQLite to etcd
 */
async function migrateHeartbeats(sqlite: any, etcd: EtcdDatabase): Promise<void> {
	console.log('Migrating heartbeats...');

	let offset = 0;
	const batchSize = 100;

	while (true) {
		const batch = await sqlite
			.select()
			.from(schema.heartbeats)
			.limit(batchSize)
			.offset(offset)
			.execute();

		if (batch.length === 0) break;

		for (const heartbeat of batch) {
			await etcd.heartbeats().insert({
				monitorNamespace: heartbeat.monitorNamespace,
				monitorName: heartbeat.monitorName,
				monitorId: heartbeat.monitorId,
				state: heartbeat.state,
				latencyMs: heartbeat.latencyMs,
				reason: heartbeat.reason,
				message: heartbeat.message,
				checkedAt: heartbeat.checkedAt,
			});

			stats.heartbeats++;
			stats.total++;

			if (stats.heartbeats % 100 === 0) {
				console.log(`  Migrated ${stats.heartbeats} heartbeats...`);
			}
		}

		offset += batchSize;
	}

	console.log(`✓ Migrated ${stats.heartbeats} heartbeats`);
}

/**
 * Migrate incidents from SQLite to etcd
 */
async function migrateIncidents(sqlite: any, etcd: EtcdDatabase): Promise<void> {
	console.log('Migrating incidents...');

	const incidents = await sqlite.select().from(schema.incidents).execute();

	for (const incident of incidents) {
		await etcd.incidents().insert({
			monitorNamespace: incident.monitorNamespace,
			monitorName: incident.monitorName,
			monitorId: incident.monitorId,
			state: incident.state,
			startedAt: incident.startedAt,
			endedAt: incident.endedAt,
			duration: incident.duration,
			suppressed: incident.suppressed ? 1 : 0,
			suppressReason: incident.suppressReason,
			acknowledged: incident.acknowledged ? 1 : 0,
			acknowledgedAt: incident.acknowledgedAt,
			acknowledgedBy: incident.acknowledgedBy,
		});

		stats.incidents++;
		stats.total++;
	}

	console.log(`✓ Migrated ${stats.incidents} incidents`);
}

/**
 * Migrate notification deliveries from SQLite to etcd
 */
async function migrateNotifications(sqlite: any, etcd: EtcdDatabase): Promise<void> {
	console.log('Migrating notification deliveries...');

	const notifications = await sqlite.select().from(schema.notificationDeliveries).execute();

	for (const notification of notifications) {
		await etcd.notifications().insert({
			incidentId: notification.incidentId,
			monitorId: notification.monitorId,
			policyName: notification.policyName,
			providerName: notification.providerName,
			providerType: notification.providerType,
			status: notification.status,
			attempts: notification.attempts,
			lastAttemptAt: notification.lastAttemptAt,
			lastError: notification.lastError,
			metadata: notification.metadata,
			sentAt: notification.sentAt,
		});

		stats.notifications++;
		stats.total++;
	}

	console.log(`✓ Migrated ${stats.notifications} notification deliveries`);
}

/**
 * Migrate CRD cache from SQLite to etcd
 */
async function migrateCrdCache(sqlite: any, etcd: EtcdDatabase): Promise<void> {
	console.log('Migrating CRD cache...');

	const crds = await sqlite.select().from(schema.crdCache).execute();

	for (const crd of crds) {
		await etcd.crdCache().upsert(crd);
		stats.crdCache++;
		stats.total++;
	}

	console.log(`✓ Migrated ${stats.crdCache} CRD cache entries`);
}

/**
 * Verify migration by comparing counts
 */
async function verifyMigration(sqlite: any, etcd: EtcdDatabase): Promise<boolean> {
	console.log('\nVerifying migration...');

	let verified = true;

	// Verify heartbeats
	const sqliteHeartbeats = await sqlite.select({ count: sql`COUNT(*)` }).from(schema.heartbeats).execute();
	const etcdHeartbeats = await etcd.heartbeats().select().execute();
	const heartbeatMatch = sqliteHeartbeats[0].count === etcdHeartbeats.length;

	console.log(`  Heartbeats: SQLite=${sqliteHeartbeats[0].count}, etcd=${etcdHeartbeats.length}, match=${heartbeatMatch}`);
	if (!heartbeatMatch) verified = false;

	// Verify incidents
	const sqliteIncidents = await sqlite.select({ count: sql`COUNT(*)` }).from(schema.incidents).execute();
	const etcdIncidents = await etcd.incidents().select().execute();
	const incidentMatch = sqliteIncidents[0].count === etcdIncidents.length;

	console.log(`  Incidents: SQLite=${sqliteIncidents[0].count}, etcd=${etcdIncidents.length}, match=${incidentMatch}`);
	if (!incidentMatch) verified = false;

	// Verify CRD cache
	const sqliteCrds = await sqlite.select({ count: sql`COUNT(*)` }).from(schema.crdCache).execute();
	const etcdCrds = await etcd.crdCache().select().execute();
	const crdMatch = sqliteCrds[0].count === etcdCrds.length;

	console.log(`  CRD Cache: SQLite=${sqliteCrds[0].count}, etcd=${etcdCrds.length}, match=${crdMatch}`);
	if (!crdMatch) verified = false;

	if (verified) {
		console.log('\n✓ Migration verified successfully!');
	} else {
		console.log('\n✗ Migration verification failed - counts do not match');
	}

	return verified;
}

/**
 * Main migration function
 */
async function migrate() {
	console.log('=== KubeKuma SQLite → etcd Migration ===\n');
	console.log(`SQLite DB: ${SQLITE_DB}`);
	console.log(`etcd Endpoints: ${ETCD_ENDPOINTS}\n`);

	// Initialize etcd
	const etcd = new EtcdDatabase(ETCD_ENDPOINTS);
	await etcd.initialize();

	// Check if SQLite exists
	if (!sqliteExists()) {
		console.log('No SQLite database found.');
		console.log('Initializing fresh etcd database...');
		console.log('✓ etcd database ready (no migration needed)');
		await etcd.close();
		return;
	}

	console.log('SQLite database found, migrating data...\n');

	// Connect to SQLite
	const sqliteDb = new Database(SQLITE_DB);
	const sqlite = drizzle(sqliteDb, { schema });

	try {
		// Migrate all tables
		await migrateHeartbeats(sqlite, etcd);
		await migrateIncidents(sqlite, etcd);
		await migrateNotifications(sqlite, etcd);
		await migrateCrdCache(sqlite, etcd);

		// Verify migration
		const verified = await verifyMigration(sqlite, etcd);

		console.log('\n=== Migration Summary ===');
		console.log(`Total records migrated: ${stats.total}`);
		console.log(`  - Heartbeats: ${stats.heartbeats}`);
		console.log(`  - Incidents: ${stats.incidents}`);
		console.log(`  - Notifications: ${stats.notifications}`);
		console.log(`  - CRD Cache: ${stats.crdCache}`);
		console.log(`Verification: ${verified ? '✓ PASSED' : '✗ FAILED'}`);

		if (verified) {
			console.log('\n✓ Migration successful!');
			console.log('\nYou can now safely remove the SQLite database:');
			console.log(`  rm ${SQLITE_DB}`);
		} else {
			console.log('\n✗ Migration verification failed.');
			console.log('Please check the logs above for details.');
			process.exit(1);
		}
	} catch (error) {
		console.error('Migration failed:', error);
		process.exit(1);
	} finally {
		await etcd.close();
		sqliteDb.close();
	}
}

// Run migration
migrate().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
