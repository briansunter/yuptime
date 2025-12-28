@if(debug)

package main

// Values used by debug_tool.cue.
// Debug example: cue cmd -t debug -t name=yuptime -t namespace=yuptime -t mv=1.0.0 -t kv=1.28.0 build
values: {
	podAnnotations: "cluster-autoscaler.kubernetes.io/safe-to-evict": "true"

	image: {
		repository: "yuptime-api"
		tag:        "latest"
		digest:     ""
		pullPolicy: "Never"
	}

	checkerImage: {
		repository: "yuptime-checker"
		tag:        "latest"
		digest:     ""
		pullPolicy: "Never"
	}

	mode: "development"

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

	storage: {
		enabled:      true
		size:         "1Gi"
		storageClass: "standard"
		accessMode:   "ReadWriteOnce"
	}

	auth: {
		mode: "local"
		session: {
			secret:      "debug-secret"
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
			enabled:      true
			username:     "admin"
			passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$Ha7NhMrOOSle+AMHOp5XNw$jhFoCy75xBnmZJY+FKPujTeFg26xnR1wfDwFJJVrBhU"
		}
	}

	logging: level: "debug"

	service: {
		type: "ClusterIP"
		port: 3000
	}

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

	networkPolicy: enabled:            true
	podDisruptionBudget: enabled:      true
	podDisruptionBudget: minAvailable: 1
	crds: install:                     false
	testResources: enabled:            false

	test: {
		enabled: true
		image: {
			repository: "cgr.dev/chainguard/curl"
			tag:        "latest"
			digest:     ""
			pullPolicy: "IfNotPresent"
		}
	}

	affinity: nodeAffinity: requiredDuringSchedulingIgnoredDuringExecution: nodeSelectorTerms: [{
		matchExpressions: [{
			key:      "kubernetes.io/os"
			operator: "In"
			values: ["linux"]
		}]
	}]
}
