// Minikube-specific values for local testing
// Usage: timoni apply yuptime ./timoni/yuptime -n yuptime -f values-minikube.cue

values: {
	// Use local images (built in minikube's docker)
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

	// SQLite database
	database: {
		type: "sqlite"
		sqlite: path: "/data/yuptime.db"
	}

	// Storage with minikube's default StorageClass
	storage: {
		enabled:      true
		size:         "1Gi"
		storageClass: "standard"
		accessMode:   "ReadWriteOnce"
	}

	// Local auth with test admin user
	auth: {
		mode: "local"
		session: secret: "minikube-dev-secret-change-me"
		adminUser: {
			enabled:  true
			username: "admin"
			// Password: test1234
			passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$Ha7NhMrOOSle+AMHOp5XNw$jhFoCy75xBnmZJY+FKPujTeFg26xnR1wfDwFJJVrBhU"
		}
	}

	// Enable testing
	test: enabled: true
}
