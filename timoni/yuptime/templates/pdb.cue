package templates

import (
	policyv1 "k8s.io/api/policy/v1"
)

// PodDisruptionBudget to ensure availability during cluster operations
#PodDisruptionBudget: policyv1.#PodDisruptionBudget & {
	#config:    #Config
	apiVersion: "policy/v1"
	kind:       "PodDisruptionBudget"
	metadata: {
		name:      #config.metadata.name + "-pdb"
		namespace: #config.metadata.namespace
		labels:    #config.metadata.labels
	}
	spec: {
		minAvailable: #config.podDisruptionBudget.minAvailable
		selector: matchLabels: #config.selector.labels & {
			"app.kubernetes.io/component": "api-server"
		}
	}
}
