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

	crds: install: true

	// Enable Timoni health test job
	test: enabled: true
}
