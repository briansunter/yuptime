package templates

import (
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
)

#Deployment: appsv1.#Deployment & {
	#config:     #Config
	#secretName: string
	#cmName:     string

	apiVersion: "apps/v1"
	kind:       "Deployment"
	metadata: {
		name:      #config.metadata.name + "-api"
		namespace: #config.metadata.namespace
		labels:    #config.metadata.labels & {
			"app.kubernetes.io/component": "api-server"
		}
	}
	spec: appsv1.#DeploymentSpec & {
		replicas: #config.replicas
		selector: matchLabels: #config.selector.labels & {
			"app.kubernetes.io/component": "api-server"
		}
		template: {
			metadata: {
				labels: #config.selector.labels & {
					"app.kubernetes.io/component": "api-server"
				}
				if #config.podAnnotations != _|_ {
					annotations: #config.podAnnotations
				}
			}
			spec: corev1.#PodSpec & {
				serviceAccountName: #config.metadata.name
				securityContext:    #config.podSecurityContext
				containers: [{
					name:            "api-server"
					image:           #config.image.reference
					imagePullPolicy: #config.image.pullPolicy
					ports: [{
						name:          "http"
						containerPort: #config.service.port
						protocol:      "TCP"
					}]
					env: [
						{name: "NODE_ENV", value: #config.mode},
						{name: "LOG_LEVEL", value: #config.logging.level},
						{name: "PORT", value: "\(#config.service.port)"},
						{name: "NODE_EXTRA_CA_CERTS", value: "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"},
						{name: "CHECKER_IMAGE", value: #config.checkerImage.reference},
						{name: "CHECKER_IMAGE_PULL_POLICY", value: #config.checkerImage.pullPolicy},
						{name: "CHECKER_SERVICE_ACCOUNT", value: #config.metadata.name + "-checker"},
							{name: "JOB_TTL_SECONDS", value: "\(#config.jobTTLSeconds)"},
							{name: "EXECUTION_MODE", value: #config.execution.mode},
							{name: "EXECUTION_CONCURRENCY", value: "\(#config.execution.concurrency)"},
							{name: "EXECUTION_QUEUE_CAPACITY", value: "\(#config.execution.queueCapacity)"},
							{name: "EXECUTION_SHUTDOWN_GRACE_SECONDS", value: "\(#config.execution.shutdownGraceSeconds)"},
							{name: "CHECKER_URL", value: "http://127.0.0.1:3001"},
						{
							name: "KUBE_NAMESPACE"
							valueFrom: fieldRef: fieldPath: "metadata.namespace"
						},
					]
					securityContext: #config.securityContext
					resources:       #config.resources

					// Health probes
					if #config.probes.liveness.enabled {
						startupProbe: {
							httpGet: {
								path: "/health"
								port: #config.service.port
							}
							periodSeconds:    2
							failureThreshold: 30
						}
						livenessProbe: {
							httpGet: {
								path: "/health"
								port: #config.service.port
							}
							initialDelaySeconds: #config.probes.liveness.initialDelaySeconds
							periodSeconds:       #config.probes.liveness.periodSeconds
							timeoutSeconds:      #config.probes.liveness.timeoutSeconds
							failureThreshold:    #config.probes.liveness.failureThreshold
						}
					}
					if #config.probes.readiness.enabled {
						readinessProbe: {
							httpGet: {
								path: "/ready"
								port: #config.service.port
							}
							initialDelaySeconds: #config.probes.readiness.initialDelaySeconds
							periodSeconds:       #config.probes.readiness.periodSeconds
							timeoutSeconds:      #config.probes.readiness.timeoutSeconds
							failureThreshold:    #config.probes.readiness.failureThreshold
						}
					}

					volumeMounts: [
						{name: "tmp", mountPath: "/tmp"},
					]
				}, if #config.execution.mode == "sidecar" {
					name:            "checker"
					image:           #config.checkerImage.reference
					imagePullPolicy: #config.checkerImage.pullPolicy
					command: ["bun", "src/checker-sidecar/server.ts"]
					env: [
						{name: "NODE_ENV", value: #config.mode},
						{name: "LOG_LEVEL", value: #config.logging.level},
						{name: "CHECKER_PORT", value: "3001"},
						{name: "CHECKER_CONCURRENCY", value: "\(#config.execution.concurrency)"},
						{name: "CHECKER_SHUTDOWN_GRACE_MS", value: "\(#config.execution.shutdownGraceSeconds * 1000)"},
					]
					securityContext: #config.securityContext & {
						capabilities: {
							drop: ["ALL"]
							add:  ["NET_RAW"]
						}
					}
					resources: #config.checkerResources
					livenessProbe: exec: command: [
						"bun",
						"-e",
						"const r=await fetch('http://127.0.0.1:3001/health');process.exit(r.ok?0:1)",
					]
					startupProbe: {
						exec: command: [
							"bun",
							"-e",
							"const r=await fetch('http://127.0.0.1:3001/health');process.exit(r.ok?0:1)",
						]
						periodSeconds:    2
						failureThreshold: 30
					}
					readinessProbe: exec: command: [
						"bun",
						"-e",
						"const r=await fetch('http://127.0.0.1:3001/ready');process.exit(r.ok?0:1)",
					]
					volumeMounts: [{name: "tmp", mountPath: "/tmp"}]
				}]
				volumes: [
					{name: "tmp", emptyDir: {}},
				]
				if #config.nodeSelector != _|_ {
					nodeSelector: #config.nodeSelector
				}
				if #config.topologySpreadConstraints != _|_ {
					topologySpreadConstraints: #config.topologySpreadConstraints
				}
				if #config.affinity != _|_ {
					affinity: #config.affinity
				}
				if #config.tolerations != _|_ {
					tolerations: #config.tolerations
				}
				if #config.imagePullSecrets != _|_ {
					imagePullSecrets: #config.imagePullSecrets
				}
			}
		}
	}
}
