// Yuptime default values
// Note that this file must have no imports and all values must be concrete.

@if(!debug)

package main

// Default values for yuptime
values: {
	// Main API server image
	image: {
		repository: "ghcr.io/yuptime/yuptime-api"
		tag:        "latest"
		digest:     ""
		pullPolicy: "IfNotPresent"
	}

	// Checker executor image
	checkerImage: {
		repository: "ghcr.io/yuptime/yuptime-checker"
		tag:        "latest"
		digest:     ""
		pullPolicy: "IfNotPresent"
	}

	// Application mode
	mode: "development"

	// Database configuration (SQLite by default)
	database: {
		type: "sqlite"
		sqlite: path: "/data/yuptime.db"
		postgresql: {
			host:     ""
			port:     5432
			database: "yuptime"
			username: "yuptime"
			passwordSecretRef: {
				name: ""
				key:  "password"
			}
			sslMode: "require"
		}
		etcd: {
			endpoints: "http://etcd:2379"
			deploy:    false
		}
	}

	// Storage enabled by default
	storage: {
		enabled:      true
		size:         "1Gi"
		storageClass: ""
		accessMode:   "ReadWriteOnce"
	}

	// Authentication (local by default)
	auth: {
		mode: "local"
		session: {
			secret:      "dev-secret-change-in-production"
			maxAgeHours: 168
		}
		oidc: {
			issuerUrl:   ""
			clientId:    ""
			redirectUrl: ""
			clientSecretRef: {
				name: ""
				key:  "client-secret"
			}
		}
		adminUser: {
			enabled:  true
			username: "admin"
			// Default password hash for: test1234
			passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$Ha7NhMrOOSle+AMHOp5XNw$jhFoCy75xBnmZJY+FKPujTeFg26xnR1wfDwFJJVrBhU"
		}
	}

	// Logging
	logging: level: "info"

	// Service configuration
	service: {
		type: "ClusterIP"
		port: 3000
	}

	// Health probes
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

	// Optional features
	networkPolicy: enabled:        true
	podDisruptionBudget: enabled:  true
	podDisruptionBudget: minAvailable: 1
	crds: install:                 false // CRDs should be applied separately
	testResources: enabled:        false

	// Test job image
	test: {
		enabled: false
		image: {
			repository: "cgr.dev/chainguard/curl"
			tag:        "latest"
			digest:     ""
			pullPolicy: "IfNotPresent"
		}
	}
}
