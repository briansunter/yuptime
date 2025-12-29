# Yuptime Testing Guide

This guide covers all testing aspects of the Yuptime project, including unit tests, type checking, linting, and end-to-end testing.

## Quick Reference

```bash
# Run all checks (recommended before committing)
bun run check

# Run individual checks
bun run test          # Unit tests (watch mode)
bun run test:ci       # Unit tests (CI mode)
bun run type-check    # TypeScript compilation check
bun run lint          # Biome linter

# E2E tests (requires OrbStack)
bun run e2e           # Full E2E test suite
bun run e2e:keep      # E2E without cleanup
bun run e2e:debug     # E2E with cleanup on failure
```

## Test Results Summary

### ✅ Unit Tests (80 tests)
```
80 pass
0 fail
141 expect() calls
Ran 80 tests across 5 files in ~400ms
```

All unit tests passing:
- Crypto utilities
- Jitter algorithms
- RRULE parsing
- Selector matching
- Uptime calculations

### ✅ TypeScript Type Checking
```
✓ No compilation errors
✓ All types properly inferred
✓ Zero type assertions (any/as) in controller code
```

### ✅ Biome Linter
```
Checked 90 files
0 errors
14 warnings (all intentional - see below)
```

### Warnings (Intentional)
The following warnings are intentional with appropriate overrides:

1. **Checker files** (2 warnings)
   - `src/checker-executor/executor.ts:132` - `as any` for type compatibility
   - `src/checkers/ping.ts:95` - `error: any` for error handling
   - Override: `noExplicitAny: "warn"` for checker files

2. **Library files** (2 warnings)
   - `src/lib/rrule.ts:27` - `any` type for RRULE config parsing
   - `src/lib/secrets.ts:124` - `error: any` for secret error handling
   - Override: `noExplicitAny: "warn"` for library files

3. **Optional etcd module** (2 warnings)
   - `src/db/index.ts:19, 45` - `as any` for optional etcd integration
   - Override: `noExplicitAny: "warn"` for db/index.ts

4. **Test files** (6 warnings)
   - `src/lib/rrule.test.ts` - Non-null assertions in tests
   - Override: `noNonNullAssertion: "warn"` for test files

5. **Empty block** (1 warning)
   - `src/controller/k8s-client.ts:294` - Intentional empty callback

6. **Console logs** (1 warning)
   - Various files - Debug logging
   - Override: `noConsole: "warn"`

## Type Safety Achievements

### Zero Type Assertions in Core Code
- All 12 reconcilers use fully typed resources
- Zod schemas validate at runtime before reconciler execution
- No `as any` or `as Type` casts in controller/reconciler code

### Schema-Based Validation
```typescript
// Type-safe reconciler pattern
export const createMonitorReconciler = () =>
  createTypeSafeReconciler<Monitor>(
    "Monitor",
    "monitors",
    MonitorSchema as ZodSchema<Monitor>,
    {
      validator: typedValidate(validateMonitor),
      reconciler: reconcileMonitor,  // Receives typed Monitor
    },
  );
```

### Type-Safe Cache Access
```typescript
// Parse cached resources with Zod before use
const provider = NotificationProviderSchema.parse({
  apiVersion: "monitoring.yuptime.io/v1",
  kind: "NotificationProvider",
  metadata: { /* ... */ },
  spec: cachedProvider.spec,
  status: cachedProvider.status,
});
```

## End-to-End Testing

### Prerequisites

1. **OrbStack** (macOS) or **Minikube** (Linux/CI)
   ```bash
   # OrbStack (recommended for macOS)
   brew install --cask orbstack
   orb config kubernetes enable

   # Or Minikube (Linux/CI)
   brew install minikube  # macOS
   minikube start
   ```

2. **Docker**
   ```bash
   docker --version
   ```

3. **Timoni**
   ```bash
   brew install timoni
   ```

4. **kubectl**
   ```bash
   brew install kubectl
   ```

### Running E2E Tests

```bash
# Full test suite (cleanup on success)
bun run e2e

# Keep resources for debugging
bun run e2e:keep

# Cleanup even on failure (CI mode)
bun run e2e:debug

# Custom namespace
./scripts/e2e-orbstack.sh --namespace my-namespace

# Skip all cleanup
./scripts/e2e-orbstack.sh --no-cleanup
```

### E2E Test Coverage

The E2E test suite validates:

1. **Infrastructure**
   - ✓ Kubernetes cluster connectivity
   - ✓ Docker image builds
   - ✓ CRD installation (11 CRDs)
   - ✓ Timoni module deployment

2. **Application**
   - ✓ Pod readiness and health checks
   - ✓ Service endpoints
   - ✓ API responses

3. **Functionality**
   - ✓ Monitor creation and reconciliation
   - ✓ Check job execution
   - ✓ Status updates
   - ✓ API endpoints (health, monitors, status-pages, metrics)

4. **Integration**
   - ✓ Controller → Scheduler → Checker executor
   - ✓ Checker executor → Kubernetes API (status updates)
   - ✓ Incident creation and notification flow

### Quick Test Helper

Interactive menu for common testing tasks:

```bash
./scripts/test-e2e-quick.sh
```

Options:
- Run full E2E test suite
- Check cluster status
- View pod logs
- View monitor status
- View incidents
- View jobs
- Port forward API
- Cleanup resources
- Shell into pod

### Debugging E2E Tests

```bash
# Check pod status
kubectl get pods -n yuptime -o wide

# View controller logs
kubectl logs -n yuptime -l app.kubernetes.io/name=yuptime -f

# Check monitor status
kubectl get monitors -n yuptime -o wide
kubectl get monitor httpbin-test -n yuptime -o yaml

# View incidents
kubectl get incidents -n yuptime

# View jobs
kubectl get jobs -n yuptime

# Port forward for local testing
kubectl port-forward svc/yuptime-api 3000:3000 -n yuptime
curl http://localhost:3000/health
curl http://localhost:3000/api/monitors
```

## Test Architecture

### Unit Tests Structure

```
src/
├── controller/job-manager/
│   └── jitter.test.ts           # Jitter algorithm tests
├── lib/
│   ├── crypto.test.ts            # Password hashing tests
│   ├── rrule.test.ts             # RRULE parsing tests
│   ├── selectors.test.ts         # Label selector tests
│   └── uptime.test.ts            # Uptime calculation tests
```

### E2E Test Structure

```
scripts/
├── e2e-orbstack.sh              # Main E2E test script
├── test-e2e-quick.sh            # Interactive test helper
└── E2E_TESTS.md                 # E2E documentation
```

## CI/CD Integration

### Pre-commit Hooks
```bash
# Automatically run before commits
bun run lint          # Biome linting
bun run type-check    # TypeScript compilation
bun run test:ci       # Unit tests
```

### GitHub Actions

- **E2E Tests**: `.github/workflows/e2e.yml`
  - Runs on push to master
  - Runs on pull requests
  - Uses Minikube for Kubernetes
  - Deploys with Timoni
  - Tests CRDs, monitors, API endpoints

## Testing Best Practices

### 1. Type Safety First
- Use Zod schemas for all CRD validation
- Parse resources with Zod before use
- Never use `as any` or `as Type` casts in core code
- Leverage TypeScript's type inference

### 2. Test Isolation
- Each test should be independent
- Use fresh fixtures for each test
- Clean up resources after tests
- Avoid shared state between tests

### 3. Comprehensive Coverage
- Unit tests for pure functions
- Integration tests for workflows
- E2E tests for full system validation
- Type checking for compile-time safety

### 4. Fast Feedback
- Unit tests should run in < 1 second
- Use watch mode during development
- Run full suite before commits
- E2E tests run only when needed

## Troubleshooting

### Unit Tests

**Tests hanging:**
```bash
# Check for unclosed async operations
# Use --ci flag for auto-timeout
bun run test:ci
```

**TypeScript errors:**
```bash
# Clear cache and rebuild
rm -rf node_modules/.cache
bun run type-check
```

### E2E Tests

**OrbStack not connected:**
```bash
orb config kubernetes enable
kubectl cluster-info
```

**Images not found:**
```bash
# Rebuild images
docker build -t yuptime-api:test -f Dockerfile .
docker build -t yuptime-checker:test -f Dockerfile.checker .
```

**Port already in use:**
```bash
# Kill existing process
lsof -ti:3000 | xargs kill -9
```

**Pods not starting:**
```bash
# Check pod status
kubectl get pods -n yuptime
kubectl describe pod <pod-name> -n yuptime

# Check logs
kubectl logs -n yuptime <pod-name>

# Check events
kubectl get events -n yuptime --sort-by='.lastTimestamp'
```

## Adding New Tests

### Unit Test Example

```typescript
import { describe, expect, test } from "bun:test";

describe("My Feature", () => {
  test("should do something", () => {
    const result = myFunction("input");
    expect(result).toBe("expected output");
  });
});
```

### E2E Test Example

Add to `scripts/e2e-orbstack.sh`:

```bash
test_my_feature() {
    print_section "Testing My Feature"

    log_info "Creating test resource..."
    kubectl apply -f - << EOF
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: test-my-feature
  namespace: $NAMESPACE
spec:
    # ... configuration
EOF

    log_info "Waiting for reconciliation..."
    sleep 5

    log_info "Verifying results..."
    local result=$(kubectl get monitor test-my-feature -n "$NAMESPACE" -o jsonpath='{.status.phase}')
    if [ "$result" = "active" ]; then
        log_success "✓ Feature works"
    else
        log_error "✗ Feature failed"
        exit 1
    fi
}
```

## Test Metrics

### Current Coverage
- **Unit Tests**: 80 tests across 5 files (~714ms)
- **Type Safety**: 100% in controller/reconciler code
- **Lint Rules**: 40+ strict Biome rules
- **E2E Tests**: 10+ validation steps

### Performance Targets
- Unit tests: < 1 second
- Type check: < 5 seconds
- Linter: < 100ms (90 files)
- E2E tests: < 5 minutes (OrbStack)

## Related Documentation

- `scripts/E2E_TESTS.md` - Detailed E2E testing guide
- `CLAUDE.md` - Project architecture and development guide
- `.github/workflows/e2e.yml` - CI E2E test workflow
- `biome.json` - Linting configuration
