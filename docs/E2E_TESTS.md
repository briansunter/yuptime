# Yuptime E2E Tests

This directory contains end-to-end tests for Yuptime using OrbStack.

## Prerequisites

1. **OrbStack** - macOS Kubernetes platform
   ```bash
   # Install OrbStack
   brew install --cask orbstack

   # Enable Kubernetes
   orb config kubernetes enable
   ```

2. **Docker** - Container runtime
   ```bash
   # Install Docker Desktop or OrbStack includes Docker
   docker --version
   ```

3. **Timoni** - Kubernetes package manager
   ```bash
   brew install timoni
   ```

4. **kubectl** - Kubernetes CLI
   ```bash
   brew install kubectl
   ```

## Quick Start

Run the full E2E test suite:
```bash
bun run e2e
```

## Test Modes

### Standard Mode (cleanup on success)
```bash
bun run e2e
# Runs tests and cleans up resources on success
# Resources preserved on failure for debugging
```

### Keep Resources Mode (no cleanup)
```bash
bun run e2e:keep
# Runs tests and preserves all resources
# Useful for manual inspection and debugging
```

### Debug Mode (cleanup on failure)
```bash
bun run e2e:debug
# Runs tests and cleans up even on failure
# Useful for CI/CD pipelines
```

## Manual Script Execution

You can also run the script directly with custom options:

```bash
# Basic usage
./scripts/e2e-orbstack.sh

# Custom namespace
./scripts/e2e-orbstack.sh --namespace my-namespace

# Skip all cleanup
./scripts/e2e-orbstack.sh --no-cleanup

# Show help
./scripts/e2e-orbstack.sh --help
```

## What the Tests Do

The E2E test suite performs the following checks:

1. **Prerequisites Check**
   - OrbStack availability
   - Kubernetes cluster connectivity
   - Docker availability
   - Timoni installation

2. **Build Docker Images**
   - Builds `yuptime-api:test` image
   - Builds `yuptime-checker:test` image

3. **Deploy Yuptime**
   - Validates Timoni module
   - Installs CRDs
   - Deploys controller and dependencies
   - Configures SQLite database
   - Sets up local authentication

4. **Verify Deployment**
   - Checks all 11 CRDs are installed
   - Waits for deployment to be ready
   - Performs health check on `/health` endpoint

5. **Create Test Monitor**
   - Creates HTTP monitor for httpbin.org
   - Monitors are reconciled by controller

6. **Wait for Check Job**
   - Waits for checker job to complete
   - Verifies job execution
   - Displays job logs

7. **Verify API Endpoints**
   - Tests `/health` endpoint
   - Tests `/api/monitors` endpoint
   - Tests `/api/status-pages` endpoint
   - Tests `/metrics` endpoint

8. **Verify Monitor Status**
   - Checks monitor CRD status
   - Displays incident information

## Test Resources

The test creates the following resources in the `yuptime` namespace:

- **Monitor**: `httpbin-test` - HTTP check against httpbin.org
- **Jobs**: Checker jobs created by scheduler
- **Incidents**: Created if monitor fails (unlikely with httpbin.org)

## Cleanup

By default, resources are cleaned up on success. To manually cleanup:

```bash
# Delete test resources
kubectl delete namespace yuptime

# Or cleanup specific resources
kubectl delete monitor httpbin-test -n yuptime
kubectl delete jobs -l yuptime.io/monitor=httpbin-test -n yuptime
```

## Debugging Failed Tests

If tests fail:

1. **Check pod status**
   ```bash
   kubectl get pods -n yuptime
   kubectl describe pod <pod-name> -n yuptime
   ```

2. **View logs**
   ```bash
   kubectl logs -n yuptime -l app.kubernetes.io/name=yuptime --tail=100 -f
   ```

3. **Check events**
   ```bash
   kubectl get events -n yuptime --sort-by='.lastTimestamp'
   ```

4. **Port forward for local debugging**
   ```bash
   kubectl port-forward svc/yuptime-api 3000:3000 -n yuptime
   curl http://localhost:3000/health
   curl http://localhost:3000/api/monitors
   ```

5. **Check CRD status**
   ```bash
   kubectl get monitors -n yuptime
   kubectl get monitor httpbin-test -n yuptime -o yaml
   kubectl get incidents -n yuptime
   kubectl get jobs -n yuptime
   ```

## CI/CD Integration

The E2E tests can be integrated into CI/CD pipelines:

```yaml
- name: Run E2E Tests
  run: |
    bun run e2e:debug
  env:
    CLEANUP_ON_FAILURE: true
```

## Troubleshooting

### OrbStack Kubernetes not enabled
```bash
orb config kubernetes enable
```

### Port forward already in use
```bash
# Find and kill existing process
lsof -ti:3000 | xargs kill -9
```

### Images not found in cluster
```bash
# Ensure images are built
docker images | grep yuptime

# If using Minikube, eval minikube docker first
eval $(minikube docker-env)
```

### Timoni module validation fails
```bash
cd timoni/yuptime
timoni mod vet
timoni mod lint
```

## Test Configuration

Environment variables:
- `TIMEOUT_MINUTES`: Test timeout (default: 15)
- `CLEANUP_ON_SUCCESS`: Cleanup on success (default: true)
- `CLEANUP_ON_FAILURE`: Cleanup on failure (default: false)
- `NAMESPACE`: Kubernetes namespace (default: yuptime)

Example:
```bash
TIMEOUT_MINUTES=20 CLEANUP_ON_FAILURE=true bun run e2e
```

## Adding New Tests

To add new E2E tests:

1. Add test function in `scripts/e2e-orbstack.sh`
2. Call function in `run_tests()` function
3. Update test results summary in `main()` function

Example:
```bash
test_new_feature() {
    print_section "Testing New Feature"

    log_info "Creating test resource..."
    kubectl apply -f - << EOF
    apiVersion: monitoring.yuptime.io/v1
    kind: Monitor
    metadata:
      name: test-new-feature
      namespace: $NAMESPACE
    spec:
      # ... test configuration
    EOF

    log_info "Verifying feature..."
    # Add verification logic
}
```

## Related Files

- `.github/workflows/e2e.yml` - GitHub Actions E2E tests (Minikube)
- `timoni/yuptime/` - Timoni module for deployment
- `Dockerfile` - Controller image
- `Dockerfile.checker` - Checker executor image
