package templates

import (
	corev1 "k8s.io/api/core/v1"
)

// Secret for sensitive configuration
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
	stringData: {
		"session-secret": #config.auth.session.secret

		// PostgreSQL database URL (when using postgresql)
		if #config.database.type == "postgresql" && #config.database.postgresql.host != "" {
			"database-url": "postgresql://\(#config.database.postgresql.username)@\(#config.database.postgresql.host):\(#config.database.postgresql.port)/\(#config.database.postgresql.database)?sslmode=\(#config.database.postgresql.sslMode)"
		}

		// Admin password hash (when using local auth with admin user)
		if #config.auth.mode == "local" && #config.auth.adminUser.enabled && #config.auth.adminUser.passwordHash != "" {
			"admin-password-hash": #config.auth.adminUser.passwordHash
		}
	}
}

// Admin password secret (separate for LocalUser CRD reference)
#AdminPasswordSecret: corev1.#Secret & {
	#config:    #Config
	apiVersion: "v1"
	kind:       "Secret"
	metadata: {
		name:      "admin-password"
		namespace: #config.metadata.namespace
		labels:    #config.metadata.labels
	}
	type: "Opaque"
	stringData: {
		hash: #config.auth.adminUser.passwordHash
	}
}
