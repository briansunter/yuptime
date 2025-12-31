package templates

import (
	corev1 "k8s.io/api/core/v1"
)

// ConfigMap for non-sensitive environment configuration
#ConfigMap: corev1.#ConfigMap & {
	#config:    #Config
	apiVersion: "v1"
	kind:       "ConfigMap"
	metadata: {
		name:      #config.metadata.name + "-config"
		namespace: #config.metadata.namespace
		labels:    #config.metadata.labels
	}
	data: {
		NODE_ENV:  #config.mode
		LOG_LEVEL: #config.logging.level
	}
}
