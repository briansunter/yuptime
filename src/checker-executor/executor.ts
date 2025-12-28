/**
 * Checker Executor
 * Executes monitor checks in Job pods
 */

import { KubeConfig, CustomObjectsApi } from "@kubernetes/client-node";
import { executeCheck as runCheck } from "../checkers";
import { getDatabase } from "../db";
import { heartbeats } from "../db/schema";
import type { CheckResult } from "../checkers";
import type { Monitor } from "../types/crd";

const logger = console;

/**
 * Load a Monitor CRD from Kubernetes API
 */
export async function loadMonitorCRD(
	namespace: string,
	name: string
): Promise<Monitor> {
	const kubeConfig = new KubeConfig();
	kubeConfig.loadFromDefault();

	// Accept self-signed certificates for local development
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

	const customObjectsApi = kubeConfig.makeApiClient(CustomObjectsApi);

	try {
		const response = await customObjectsApi.getNamespacedCustomObject({
			group: "monitoring.kubekuma.io",
			version: "v1",
			namespace: namespace,
			plural: "monitors",
			name: name,
		});

		return response as Monitor;
	} catch (error) {
		logger.error(`Failed to load Monitor CRD ${namespace}/${name}:`, error);
		throw error;
	}
}

/**
 * Execute a monitor check
 */
export async function executeCheck(
	namespace: string,
	name: string
): Promise<CheckResult> {
	try {
		// Load Monitor CRD
		const monitor = await loadMonitorCRD(namespace, name);

		// Get timeout from monitor spec
		const timeout = monitor.spec.schedule?.timeoutSeconds || 30;

		logger.info(`Executing check for ${namespace}/${name}`);

		// Execute the check
		const result = await runCheck(monitor as any, timeout);

		logger.info(
			{
				monitor: `${namespace}/${name}`,
				state: result.state,
				latencyMs: result.latencyMs,
			},
			"Check completed"
		);

		return result;
	} catch (error) {
		logger.error(`Check execution failed for ${namespace}/${name}:`, error);

		return {
			state: "down",
			latencyMs: 0,
			reason: "EXECUTION_ERROR",
			message: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Write heartbeat with retry for SQLite lock errors
 */
export async function writeHeartbeat(
	namespace: string,
	name: string,
	result: CheckResult
): Promise<void> {
	const db = getDatabase();
	const monitorId = `${namespace}/${name}`;

	const maxRetries = 5;
	const baseDelay = 100; // 100ms

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			await db.insert(heartbeats).values({
				monitorNamespace: namespace,
				monitorName: name,
				monitorId,
				state: result.state,
				latencyMs: result.latencyMs,
				reason: result.reason || null,
				message: result.message || null,
				checkedAt: new Date().toISOString(),
			});

			logger.debug(`Wrote heartbeat for ${monitorId}`);
			return;
		} catch (error: any) {
			const isLockedError = error?.code === "SQLITE_BUSY" || error?.errno === 5;

			if (isLockedError && attempt < maxRetries) {
				const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
				logger.debug(
					{ monitorId, attempt, delay },
					"Database locked, retrying..."
				);
				await new Promise((resolve) => setTimeout(resolve, delay));
			} else {
				logger.error(
					{ monitorId, attempt, error },
					"Failed to write heartbeat after retries"
				);
				throw error;
			}
		}
	}
}
