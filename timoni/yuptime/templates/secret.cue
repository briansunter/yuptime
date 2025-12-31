package templates

import (
	corev1 "k8s.io/api/core/v1"
)

// Secret for sensitive configuration (minimal, for future use)
#Secret: corev1.#Secret & {
	#config:    #Config
	apiVersion: "v1"
	kind:       "Secret"
	metadata: {
		name:      #config.metadata.name + "-config"
		namespace: #config.metadata.namespace
		labels:    #config.metadata.labels
	}
	type: "Opaque"
	// Currently empty - no secrets required for database-free architecture
	stringData: {}
}
