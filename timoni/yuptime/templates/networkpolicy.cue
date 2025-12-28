package templates

import (
	networkingv1 "k8s.io/api/networking/v1"
)

// NetworkPolicy to control network access
#NetworkPolicy: networkingv1.#NetworkPolicy & {
	#config:    #Config
	apiVersion: "networking.k8s.io/v1"
	kind:       "NetworkPolicy"
	metadata: {
		name:      #config.metadata.name + "-controller"
		namespace: #config.metadata.namespace
		labels:    #config.metadata.labels
	}
	spec: {
		podSelector: matchLabels: #config.selector.labels
		policyTypes: ["Ingress", "Egress"]
		ingress: [
			// Allow HTTP traffic from any namespace
			{
				from: [{
					namespaceSelector: {}
				}]
				ports: [{
					protocol: "TCP"
					port:     #config.service.port
				}]
			},
		]
		egress: [
			// Allow Kubernetes API access
			{
				to: [{
					namespaceSelector: matchLabels: "kubernetes.io/metadata.name": "kube-system"
				}]
				ports: [{
					protocol: "TCP"
					port:     443
				}]
			},
			// Allow PostgreSQL access (optional)
			{
				to: [{
					podSelector: matchLabels: app: "postgres"
				}]
				ports: [{
					protocol: "TCP"
					port:     5432
				}]
			},
			// Allow HTTP/HTTPS to any destination (for monitor checks)
			{
				to: [{
					ipBlock: cidr: "0.0.0.0/0"
				}]
				ports: [
					{protocol: "TCP", port: 80},
					{protocol: "TCP", port: 443},
					{protocol: "TCP", port: 8080},
				]
			},
			// Allow DNS resolution
			{
				to: [{
					namespaceSelector: matchLabels: "kubernetes.io/metadata.name": "kube-system"
				}]
				ports: [
					{protocol: "UDP", port: 53},
					{protocol: "TCP", port: 53},
				]
			},
		]
	}
}
