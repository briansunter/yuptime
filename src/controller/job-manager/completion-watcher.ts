/**
 * Job Completion Watcher
 * Watches for Job completion and updates Monitor status
 */

import { KubeConfig, BatchV1Api, CustomObjectsApi } from "@kubernetes/client-node";
import { Watch } from "@kubernetes/client-node/dist/watch";
import { getDatabase } from "../../db";
import { heartbeats } from "../../db/schema";
import { eq, desc } from "drizzle-orm";
import { updateStatus, createCondition } from "../reconcilers/status-utils";
import { logger } from "../../lib/logger";

/**
 * Get the last heartbeat for a monitor
 */
export async function getLastHeartbeat(monitorId: string) {
	const db = getDatabase();

	const result = await db
		.select({
			state: heartbeats.state,
			latency: heartbeats.latencyMs,
			reason: heartbeats.reason,
			message: heartbeats.message,
			checkedAt: heartbeats.checkedAt,
		})
		.from(heartbeats)
		.where(eq(heartbeats.monitorId, monitorId))
		.orderBy(desc(heartbeats.checkedAt))
		.limit(1);

	return result[0];
}

/**
 * Start the job completion watcher
 */
export function createJobCompletionWatcher(kubeConfig: KubeConfig) {
	const batchApi = kubeConfig.makeApiClient(BatchV1Api);
	const customObjectsApi = kubeConfig.makeApiClient(CustomObjectsApi);
	let watching = false;
	let watch: any;

	// Track which monitors are currently being scheduled to prevent duplicates
	const schedulingLocks = new Map<string, NodeJS.Timeout>();

	/**
	 * Handle Job completion
	 */
	async function handleJobCompletion(job: any) {
		const annotations = job.metadata?.annotations || {};
		const monitorId = annotations["monitoring.kubekuma.io/monitor"];

		if (!monitorId) {
			logger.debug({ jobName: job.metadata?.name }, "Job missing monitor annotation");
			return;
		}

		const [namespace, name] = monitorId.split("/");

		try {
			// Get the latest heartbeat from database
			const heartbeat = await getLastHeartbeat(monitorId);

			if (!heartbeat) {
				logger.warn({ monitorId }, "No heartbeat found for monitor");
				return;
			}

			// Update Monitor status
			const isHealthy = heartbeat.state === "up" || heartbeat.state === "healthy";
			const conditionType = isHealthy ? "Healthy" : "Unhealthy";

			const status = {
				conditions: [
					createCondition(
						conditionType,
						isHealthy ? "True" : "False",
						heartbeat.reason,
						heartbeat.message
					),
				],
				lastCheck: heartbeat.checkedAt,
				lastState: heartbeat.state,
				latency: heartbeat.latency,
			};

			await updateStatus("Monitor", "monitors", namespace, name, status);

			logger.info(
				{
					monitorId,
					state: heartbeat.state,
					latency: heartbeat.latency,
				},
				"Updated Monitor status after Job completion"
			);

			// Schedule next check using the same interval
			// Load the Monitor CRD to get the interval
			try {
				const monitor = await customObjectsApi.getNamespacedCustomObject({
					group: "monitoring.kubekuma.io",
					version: "v1",
					namespace: namespace,
					plural: "monitors",
					name: name,
				});

				const intervalSeconds = monitor.spec?.schedule?.intervalSeconds || 60;

				// Check if already scheduled to prevent duplicates
				if (schedulingLocks.has(monitorId)) {
					logger.debug({ monitorId }, "Next check already scheduled, skipping");
					return;
				}

				// Schedule next check with full interval delay
				const timeoutId = setTimeout(async () => {
					try {
						// Import here to avoid circular dependency
						const { buildJobForMonitor } = require("../job-manager/job-builder");
						const { calculateJitter } = require("../job-manager/jitter");

						const jitterPercent = monitor.spec?.schedule?.jitterPercent || 5;
						const jitterMs = calculateJitter(namespace, name, jitterPercent, intervalSeconds);

						const job = buildJobForMonitor(monitor, jitterMs);

						await batchApi.createNamespacedJob({
							namespace,
							body: job
						});

						logger.info({ monitorId, intervalSeconds }, "Scheduled next check");
					} catch (error) {
						logger.error({ monitorId, error }, "Failed to schedule next check");
					} finally {
						// Clear the lock so the next completion can schedule
						schedulingLocks.delete(monitorId);
					}
				}, intervalSeconds * 1000);

				// Store the timeout ID so we can cancel it if needed and track the lock
				schedulingLocks.set(monitorId, timeoutId);
			} catch (error) {
				logger.error({ monitorId, error }, "Failed to load Monitor for rescheduling");
			}
		} catch (error) {
			logger.error({ monitorId, error }, "Failed to update Monitor status after Job completion");
		}
	}

	/**
	 * Start watching Jobs
	 */
	async function start() {
		if (watching) {
			logger.warn("Job completion watcher already running");
			return;
		}

		watching = true;
		logger.info("Starting Job completion watcher");

		try {
			const path = "/apis/batch/v1/jobs";
			watch = new Watch(kubeConfig);

			// Watch for changes to Jobs
			await watch.watch(
				path,
				{ labelSelector: "app.kubernetes.io/component=checker" },
				// callback
				(phase: string, apiObj: any) => {
					// Only process when job is completed (succeeded or failed)
					if (phase === "MODIFIED") {
						const job = apiObj;
						const status = job.status;
						const annotations = job.metadata?.annotations || {};
						const monitorId = annotations["monitoring.kubekuma.io/monitor"];

						// Only process jobs that have actually completed
						if (monitorId && (status?.succeeded || status?.failed)) {
							// Check if we've already processed this job (track processed jobs)
							const processedKey = `${job.metadata?.name}-${status?.succeeded || status?.failed}`;
							if (!watch.processedJobs) {
								watch.processedJobs = new Set();
							}

							if (!watch.processedJobs.has(processedKey)) {
								watch.processedJobs.add(processedKey);
								handleJobCompletion(apiObj);

								// Clean up old processed job keys (keep last 100)
								if (watch.processedJobs.size > 100) {
									const entries = Array.from(watch.processedJobs);
									watch.processedJobs = new Set(entries.slice(-100));
								}
							}
						}
					}
				},
				// done callback
				(err: any) => {
					if (err) {
						logger.error({ error: err }, "Job watch error");
					}
				}
			);

			logger.info("Job completion watcher started successfully");
		} catch (error) {
			logger.error({ error }, "Failed to start Job completion watcher");
			watching = false;
			throw error;
		}
	}

	/**
	 * Stop watching Jobs
	 */
	async function stop() {
		if (!watching) {
			return;
		}

		watching = false;

		// Note: Watch.watch() doesn't return AbortController in this version
		// The watch will be cleaned up when the object is garbage collected
		watch = null;

		logger.info("Job completion watcher stopped");
	}

	return {
		start,
		stop,
		handleJobCompletion,
	};
}
