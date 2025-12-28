/**
 * etcd-based Database Initialization
 * Replaces SQLite/Drizzle with Kubernetes etcd for maximum cloud-native architecture
 */

import { EtcdDatabase } from '../db-etcd/client';
import * as schema from './schema';
import { logger } from '../lib/logger';

let db: EtcdDatabase | null = null;

/**
 * Initialize etcd database connection
 */
export async function initializeDatabase(): Promise<EtcdDatabase> {
  if (db) {
    logger.warn('Database already initialized');
    return db;
  }

  // Get etcd endpoints from environment or use Kubernetes default
  const etcdEndpoints = process.env.ETCD_ENDPOINTS || 'https://kubernetes.default.svc:2379';

  logger.info({ etcdEndpoints }, 'Initializing etcd database connection...');

  db = new EtcdDatabase(etcdEndpoints);
  await db.initialize();

  logger.info('etcd database connection established');

  return db;
}

/**
 * Get database instance
 * @throws Error if database not initialized
 */
export function getDatabase(): EtcdDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

export type DbInstance = EtcdDatabase;
export { schema };
