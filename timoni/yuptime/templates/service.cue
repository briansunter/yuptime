package templates

import (
	corev1 "k8s.io/api/core/v1"
)

#Service: corev1.#Service & {
	#config:    #Config
	apiVersion: "v1"
	kind:       "Service"
	metadata: {
		name:      #config.metadata.name + "-api"
		namespace: #config.metadata.namespace
		labels:    #config.metadata.labels & {
			"app.kubernetes.io/component": "api-server"
		}
		if #config.service.annotations != _|_ {
			annotations: #config.service.annotations
		}
	}
	spec: corev1.#ServiceSpec & {
		type:     #config.service.type
		selector: #config.selector.labels & {
			"app.kubernetes.io/component": "api-server"
		}
		ports: [{
			port:       #config.service.port
			targetPort: #config.service.port
			protocol:   "TCP"
			name:       "http"
		}]
	}
}
