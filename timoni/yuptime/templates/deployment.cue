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
						{name: "AUTH_MODE", value: #config.auth.mode},
						{
							name: "SESSION_SECRET"
							valueFrom: secretKeyRef: {
								name: #secretName
								key:  "session-secret"
							}
						},
						{
							name: "KUBE_NAMESPACE"
							valueFrom: fieldRef: fieldPath: "metadata.namespace"
						},
						// Database URL based on type
						if #config.database.type == "sqlite" {
							{name: "DATABASE_URL", value: "sqlite:" + #config.database.sqlite.path}
						},
						if #config.database.type == "postgresql" {
							{
								name: "DATABASE_URL"
								valueFrom: secretKeyRef: {
									name: #secretName
									key:  "database-url"
								}
							}
						},
						if #config.database.type == "etcd" {
							{name: "ETCD_ENDPOINTS", value: #config.database.etcd.endpoints}
						},
						// OIDC settings
						if #config.auth.mode == "oidc" && #config.auth.oidc.issuerUrl != "" {
							{name: "OIDC_ISSUER_URL", value: #config.auth.oidc.issuerUrl}
						},
						if #config.auth.mode == "oidc" && #config.auth.oidc.clientId != "" {
							{name: "OIDC_CLIENT_ID", value: #config.auth.oidc.clientId}
						},
						if #config.auth.mode == "oidc" && #config.auth.oidc.redirectUrl != "" {
							{name: "OIDC_REDIRECT_URL", value: #config.auth.oidc.redirectUrl}
						},
						if #config.auth.mode == "oidc" && #config.auth.oidc.clientSecretRef.name != "" {
							{
								name: "OIDC_CLIENT_SECRET"
								valueFrom: secretKeyRef: {
									name: #config.auth.oidc.clientSecretRef.name
									key:  #config.auth.oidc.clientSecretRef.key
								}
							}
						},
						// TLS settings for development
						if #config.mode == "development" {
							{name: "NODE_TLS_REJECT_UNAUTHORIZED", value: "0"}
						},
					]
					securityContext: #config.securityContext
					resources:       #config.resources

					// Health probes
					if #config.probes.liveness.enabled {
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
								path: "/health"
								port: #config.service.port
							}
							initialDelaySeconds: #config.probes.readiness.initialDelaySeconds
							periodSeconds:       #config.probes.readiness.periodSeconds
							timeoutSeconds:      #config.probes.readiness.timeoutSeconds
							failureThreshold:    #config.probes.readiness.failureThreshold
						}
					}

					volumeMounts: [
						{name: "data", mountPath: "/data"},
						{name: "tmp", mountPath: "/tmp"},
					]
				}]
				volumes: [
					if #config.storage.enabled {
						{
							name: "data"
							persistentVolumeClaim: claimName: #config.metadata.name + "-pvc"
						}
					},
					if !#config.storage.enabled {
						{name: "data", emptyDir: {}}
					},
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
