/**
 * Job Builder
 * Builds Kubernetes Job manifests from Monitor CRDs
 */

import type { V1Job } from "@kubernetes/client-node";
import type { Monitor } from "./types";

/**
 * Build a Kubernetes Job manifest for a monitor check
 */
export function buildJobForMonitor(
	monitor: Monitor,
	jitterMs: number,
	image: string = "kubekuma-checker:latest"
): V1Job {
	const namespace = monitor.metadata.namespace || "default";
	const monitorId = `${namespace}/${monitor.metadata.name}`;
	// Sanitize monitor ID for Kubernetes labels (replace '/' with '-')
	const monitorLabelId = monitorId.replace(/\//g, "-");
	const timestamp = Date.now();

	return {
		apiVersion: "batch/v1",
		kind: "Job",
		metadata: {
			name: `monitor-${namespace.replace(/[^a-z0-9]/g, "-")}-${monitor.metadata.name}-${timestamp}`,
			namespace,
			annotations: {
				"monitoring.kubekuma.io/monitor": monitorId,
				"monitoring.kubekuma.io/jitter-offset": jitterMs.toString(),
				"monitoring.kubekuma.io/check-id": `${monitorId}-${timestamp}`,
			},
			labels: {
				"app.kubernetes.io/name": "kubekuma",
				"app.kubernetes.io/component": "checker",
				"monitoring.kubekuma.io/monitor": monitorLabelId,
			},
			// Auto-cleanup when Monitor is deleted
			ownerReferences: [
				{
					apiVersion: monitor.apiVersion,
					kind: monitor.kind,
					name: monitor.metadata.name,
					uid: monitor.metadata.uid,
					controller: true,
					blockOwnerDeletion: true,
				},
			],
		},
		spec: {
			backoffLimit: 0, // No retries (check logic handles retry)
			activeDeadlineSeconds: 300, // 5 minutes max execution time
			ttlSecondsAfterFinished: 3600, // Auto-cleanup after 1 hour
			template: {
				metadata: {
					labels: {
						"app.kubernetes.io/name": "kubekuma",
						"app.kubernetes.io/component": "checker",
						"monitoring.kubekuma.io/monitor": monitorLabelId,
					},
				},
				spec: {
					restartPolicy: "Never",
					serviceAccountName: "kubekuma-checker",
					securityContext: {
						runAsNonRoot: true,
						runAsUser: 1000,
						fsGroup: 1000,
						seccompProfile: {
							type: "RuntimeDefault",
						},
					},
					containers: [
						{
							name: "checker",
							image,
							imagePullPolicy: image === "kubekuma-checker:latest" ? "Never" : "Always",
							args: [
								"--monitor",
								monitorId,
							],
							env: [
								{
									name: "NODE_ENV",
									value: "production",
								},
								{
									name: "ETCD_ENDPOINTS",
									value: process.env.ETCD_ENDPOINTS || "http://etcd.kubekuma.svc.cluster.local:2379",
								},
								{
									name: "NODE_TLS_REJECT_UNAUTHORIZED",
									value: "0",
								},
							],
							volumeMounts: [
								{
									name: "tmp",
									mountPath: "/tmp",
								},
							],
							resources: {
								requests: {
									cpu: "100m",
									memory: "64Mi",
								},
								limits: {
									cpu: "500m",
									memory: "256Mi",
								},
							},
							securityContext: {
								allowPrivilegeEscalation: false,
								// Note: readOnlyRootFilesystem disabled to allow database writes
								capabilities: {
									drop: ["ALL"],
								},
							},
						},
					],
					volumes: [
						{
							name: "tmp",
							emptyDir: {},
						},
					],
				},
			},
		},
	};
}

/**
 * Build a job name filter for listing jobs
 */
export function buildJobLabelSelector(monitorId: string): string {
	return `monitoring.kubekuma.io/monitor=${monitorId}`;
}
