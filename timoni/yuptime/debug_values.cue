@if(debug)

package main

// Values used by debug_tool.cue.
// Debug example: cue cmd -t debug -t name=yuptime -t namespace=yuptime -t mv=1.0.0 -t kv=1.28.0 build
values: {
	podAnnotations: "cluster-autoscaler.kubernetes.io/safe-to-evict": "true"

	image: {
		repository: "yuptime-api"
		tag:        "latest"
		digest:     ""
		pullPolicy: "Never"
	}

	checkerImage: {
		repository: "yuptime-checker"
		tag:        "latest"
		digest:     ""
		pullPolicy: "Never"
	}

	mode: "development"

	logging: level: "debug"

	service: {
		type: "ClusterIP"
		port: 3000
	}

	probes: {
		liveness: {
			enabled:             true
			initialDelaySeconds: 15
			periodSeconds:       30
			timeoutSeconds:      5
			failureThreshold:    3
		}
		readiness: {
			enabled:             true
			initialDelaySeconds: 10
			periodSeconds:       10
			timeoutSeconds:      5
			failureThreshold:    2
		}
	}

	networkPolicy: enabled:            true
	podDisruptionBudget: enabled:      true
	podDisruptionBudget: minAvailable: 1
	crds: install:                     false
	testResources: enabled:            false

	test: {
		enabled: true
		image: {
			repository: "cgr.dev/chainguard/curl"
			tag:        "latest"
			digest:     ""
			pullPolicy: "IfNotPresent"
		}
	}

	affinity: nodeAffinity: requiredDuringSchedulingIgnoredDuringExecution: nodeSelectorTerms: [{
		matchExpressions: [{
			key:      "kubernetes.io/os"
			operator: "In"
			values: ["linux"]
		}]
	}]
}
