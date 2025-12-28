// OrbStack-specific values for local testing
// Usage: timoni apply yuptime ./timoni/yuptime -n yuptime -f values-orbstack.cue

values: {
	// Use local images (OrbStack shares Docker daemon)
	image: {
		repository: "yuptime-api"
		tag:        "latest"
		digest:     ""
		pullPolicy: "Never" // Use local image
	}

	checkerImage: {
		repository: "yuptime-checker"
		tag:        "latest"
		digest:     ""
		pullPolicy: "Never"
	}

	// Development mode
	mode: "development"

	// Use etcd database (current codebase only supports etcd)
	database: {
		type: "etcd"
		etcd: {
			endpoints: "http://etcd.yuptime.svc.cluster.local:2379"
			deploy:    true // Deploy etcd StatefulSet
		}
	}

	// Storage for data
	storage: {
		enabled:      true
		size:         "1Gi"
		storageClass: ""
		accessMode:   "ReadWriteOnce"
	}

	// Local auth with test admin user
	auth: {
		mode: "local"
		session: secret: "orbstack-dev-secret-change-me"
		adminUser: {
			enabled:  true
			username: "admin"
			// Password: test1234
			passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$Ha7NhMrOOSle+AMHOp5XNw$jhFoCy75xBnmZJY+FKPujTeFg26xnR1wfDwFJJVrBhU"
		}
	}

	// Debug logging for testing
	logging: level: "debug"

	// Disable network policy and PDB for simpler testing
	networkPolicy: enabled:       false
	podDisruptionBudget: enabled: false

	// Enable testing
	test: enabled: true

	// Install CRDs with the module
	crds: install: true
}
