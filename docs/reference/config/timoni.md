# Timoni Values Reference

Complete reference for Timoni module values.

## Values Schema

```cue
values: {
  // Container images
  image: {
    repository: "ghcr.io/briansunter/yuptime-api"
    tag:        "latest"
    digest:     ""
    pullPolicy: "IfNotPresent"  // Always, IfNotPresent, Never
  }

  checkerImage: {
    repository: "ghcr.io/briansunter/yuptime-checker"
    tag:        "latest"
    digest:     ""
    pullPolicy: "IfNotPresent"
  }

  // Application mode
  mode: "development"  // development, production

  // Logging
  logging: level: "info"  // debug, info, warn, error

  // Service configuration
  service: {
    type: "ClusterIP"  // ClusterIP, NodePort, LoadBalancer
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

  // Features
  networkPolicy: enabled:        true
  podDisruptionBudget: enabled:  true
  podDisruptionBudget: minAvailable: 1
  crds: install:                 false
  testResources: enabled:        false

  // Test job
  test: {
    enabled: false
    image: {
      repository: "cgr.dev/chainguard/curl"
      tag:        "latest"
    }
  }
}
```

## Usage

```bash
cat > values.cue << 'EOF'
values: {
  mode: "production"
  logging: level: "info"
  crds: install: true
}
EOF

timoni apply yuptime oci://ghcr.io/briansunter/yuptime/timoni-module \
  --version latest \
  --namespace yuptime \
  -f values.cue
```

See [Installation with Timoni](/guide/installation/timoni) for more details.
