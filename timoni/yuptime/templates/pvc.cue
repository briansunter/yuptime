package templates

import (
	corev1 "k8s.io/api/core/v1"
)

// PersistentVolumeClaim for data storage (SQLite, etc.)
#PersistentVolumeClaim: corev1.#PersistentVolumeClaim & {
	#config:    #Config
	apiVersion: "v1"
	kind:       "PersistentVolumeClaim"
	metadata: {
		name:      #config.metadata.name + "-pvc"
		namespace: #config.metadata.namespace
		labels:    #config.metadata.labels
	}
	spec: {
		accessModes: [#config.storage.accessMode]
		resources: requests: storage: #config.storage.size
		if #config.storage.storageClass != "" {
			storageClassName: #config.storage.storageClass
		}
	}
}
