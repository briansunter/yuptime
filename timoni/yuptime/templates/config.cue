package templates

import (
	corev1 "k8s.io/api/core/v1"
	timoniv1 "timoni.sh/core/v1alpha1"
)

// Config defines the schema and defaults for Yuptime.
#Config: {
	// Kubernetes version constraint (injected at runtime)
	kubeVersion!: string
	clusterVersion: timoniv1.#SemVer & {#Version: kubeVersion, #Minimum: "1.26.0"}

	// Module version (injected at runtime)
	moduleVersion!: string

	// Kubernetes metadata for all resources
	metadata: timoniv1.#Metadata & {#Version: moduleVersion}
	metadata: labels: timoniv1.#Labels
	metadata: annotations?: timoniv1.#Annotations

	// Label selector for Deployments and Services
	selector: timoniv1.#Selector & {#Name: metadata.name}

	// Main API server image
	image!: timoniv1.#Image

	// Checker executor image (for monitor Jobs)
	checkerImage: timoniv1.#Image & {
		repository: *"ghcr.io/yuptime/yuptime-checker" | string
		tag:        *moduleVersion | string
		digest:     *"" | string
		pullPolicy: *"IfNotPresent" | "Always" | "Never"
	}

	// Replicas (singleton controller - max 1 for leader election)
	replicas: *1 | int & >=0 & <=1

	// Resource requirements
	resources: timoniv1.#ResourceRequirements & {
		requests: {
			cpu:    *"100m" | timoniv1.#CPUQuantity
			memory: *"128Mi" | timoniv1.#MemoryQuantity
		}
		limits: {
			cpu:    *"500m" | timoniv1.#CPUQuantity
			memory: *"512Mi" | timoniv1.#MemoryQuantity
		}
	}

	// Pod security context
	podSecurityContext: corev1.#PodSecurityContext & {
		runAsNonRoot: *true | bool
		runAsUser:    *1000 | int
		fsGroup:      *1000 | int
		seccompProfile: type: *"RuntimeDefault" | string
	}

	// Container security context
	securityContext: corev1.#SecurityContext & {
		allowPrivilegeEscalation: *false | true
		readOnlyRootFilesystem:   *true | false
		privileged:               *false | true
		capabilities: {
			drop: *["ALL"] | [...string]
		}
	}

	// Logging configuration
	logging: {
		level: *"info" | "debug" | "warn" | "error"
	}

	// Application mode
	mode: *"development" | "production"

	// Service configuration
	service: {
		type: *"ClusterIP" | "LoadBalancer" | "NodePort"
		port: *3000 | int & >0 & <=65535
		annotations?: timoniv1.#Annotations
	}

	// Health probes configuration
	probes: {
		liveness: {
			enabled:             *true | bool
			initialDelaySeconds: *15 | int & >=0
			periodSeconds:       *30 | int & >0
			timeoutSeconds:      *5 | int & >0
			failureThreshold:    *3 | int & >0
		}
		readiness: {
			enabled:             *true | bool
			initialDelaySeconds: *10 | int & >=0
			periodSeconds:       *10 | int & >0
			timeoutSeconds:      *5 | int & >0
			failureThreshold:    *2 | int & >0
		}
	}

	// Network Policy
	networkPolicy: {
		enabled: *true | bool
	}

	// Pod Disruption Budget
	podDisruptionBudget: {
		enabled:      *true | bool
		minAvailable: *1 | int & >=0
	}

	// CRD installation
	crds: {
		install: *true | bool
	}

	// Test resources
	testResources: {
		enabled: *false | bool
	}

	// Pod optional settings
	podAnnotations?: {[string]: string}
	imagePullSecrets?: [...timoniv1.#ObjectReference]
	tolerations?: [...corev1.#Toleration]
	affinity?: corev1.#Affinity
	topologySpreadConstraints?: [...corev1.#TopologySpreadConstraint]
	nodeSelector?: {[string]: string}

	// Test Job (for Timoni testing)
	test: {
		enabled: *false | bool
		image:   timoniv1.#Image & {
			repository: *"cgr.dev/chainguard/curl" | string
			tag:        *"latest" | string
			digest:     *"" | string
			pullPolicy: *"IfNotPresent" | "Always" | "Never"
		}
	}
}

// Instance takes the config values and outputs the Kubernetes objects.
#Instance: {
	config: #Config

	objects: {
		// Namespace
		ns: #Namespace & {#config: config}

		// ServiceAccounts
		sa: #ServiceAccount & {#config: config}
		checkerSa: #CheckerServiceAccount & {#config: config}

		// RBAC
		clusterRole: #ClusterRole & {#config: config}
		clusterRoleBinding: #ClusterRoleBinding & {#config: config}
		role: #Role & {#config: config}
		roleBinding: #RoleBinding & {#config: config}

		// ConfigMap and Secret
		cm: #ConfigMap & {#config: config}
		secret: #Secret & {#config: config}

		// Main deployment and service
		deploy: #Deployment & {
			#config:     config
			#secretName: objects.secret.metadata.name
			#cmName:     objects.cm.metadata.name
		}
		svc: #Service & {#config: config}

		// Network Policy
		if config.networkPolicy.enabled {
			netpol: #NetworkPolicy & {#config: config}
		}

		// Pod Disruption Budget
		if config.podDisruptionBudget.enabled {
			pdb: #PodDisruptionBudget & {#config: config}
		}

		// CRDs (Timoni applies these first automatically)
		if config.crds.install {
			for name, crd in customresourcedefinition {
				"\(name)": crd & {
					metadata: labels: config.metadata.labels
				}
			}
		}
	}

	// Test job for health check verification
	tests: {
		if config.test.enabled {
			"test-health": #TestJob & {#config: config}
		}
	}
}
