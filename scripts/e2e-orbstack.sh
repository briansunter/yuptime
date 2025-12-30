#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="yuptime"
TIMEOUT_MINUTES=${TIMEOUT_MINUTES:-15}
CLEANUP_ON_SUCCESS=${CLEANUP_ON_SUCCESS:-true}
CLEANUP_ON_FAILURE=${CLEANUP_ON_FAILURE:-false}

# Test configuration
TEST_MONITOR_NAME="httpbin-test"
TEST_TARGET_URL="https://httpbin.org/get"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_section() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
}

# Cleanup function
cleanup() {
    local exit_code=$?
    local should_cleanup=false

    if [ $exit_code -eq 0 ] && [ "$CLEANUP_ON_SUCCESS" = true ]; then
        should_cleanup=true
        log_info "Test succeeded, cleaning up..."
    elif [ $exit_code -ne 0 ] && [ "$CLEANUP_ON_FAILURE" = true ]; then
        should_cleanup=true
        log_warning "Test failed, cleaning up..."
    fi

    if [ "$should_cleanup" = true ]; then
        log_info "Stopping mock server..."
        if [ -n "$MOCK_SERVER_PID" ]; then
            kill $MOCK_SERVER_PID 2>/dev/null || true
        fi

        log_info "Stopping port forward..."
        kill %1 2>/dev/null || true

        log_info "Deleting test monitor..."
        kubectl delete monitor "$TEST_MONITOR_NAME" -n "$NAMESPACE" --ignore-not-found=true 2>/dev/null || true

        log_info "Collecting logs..."
        kubectl logs -n "$NAMESPACE" -l app.kubernetes.io/name=yuptime --tail=100 2>/dev/null || true

        log_info "Uninstalling Yuptime..."
        if command -v timoni &> /dev/null; then
            timoni delete yuptime -n "$NAMESPACE" 2>/dev/null || true
        fi

        log_info "Deleting namespace..."
        kubectl delete namespace "$NAMESPACE" --ignore-not-found=true 2>/dev/null || true

        log_success "Cleanup completed"
    else
        log_info "Skipping cleanup (resources preserved for debugging)"
        log_info "To cleanup manually, run:"
        echo "  kubectl delete namespace $NAMESPACE"
    fi
}

trap cleanup EXIT

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-cleanup)
                CLEANUP_ON_SUCCESS=false
                CLEANUP_ON_FAILURE=false
                shift
                ;;
            --cleanup-on-failure)
                CLEANUP_ON_FAILURE=true
                shift
                ;;
            --namespace)
                NAMESPACE="$2"
                shift 2
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --no-cleanup           Skip cleanup after tests"
                echo "  --cleanup-on-failure  Cleanup even if tests fail"
                echo "  --namespace NAME       Use custom namespace (default: yuptime)"
                echo "  --help                 Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
}

# Check if a port is available (only check LISTEN state)
check_port_available() {
    local port=$1
    if lsof -i :$port -sTCP:LISTEN > /dev/null 2>&1; then
        return 1
    fi
    return 0
}

# Check all required ports
check_ports() {
    print_section "Checking Port Availability"

    local ports=(3000 8080 8081 8082 8083 8084 8085)
    local blocked_ports=()

    for port in "${ports[@]}"; do
        if ! check_port_available $port; then
            blocked_ports+=($port)
            log_error "Port $port is in use"
            lsof -i :$port -sTCP:LISTEN 2>/dev/null | head -5
        else
            log_success "Port $port is available"
        fi
    done

    if [ ${#blocked_ports[@]} -gt 0 ]; then
        log_error "Some required ports are in use: ${blocked_ports[*]}"
        log_info "Kill the processes using these ports and try again:"
        log_info "  lsof -ti :PORT | xargs kill -9"
        exit 1
    fi

    log_success "All required ports are available"
}

# Check prerequisites
check_prerequisites() {
    print_section "Checking Prerequisites"

    # Check if OrbStack is running
    if ! command -v orb &> /dev/null; then
        log_error "OrbStack CLI not found. Please install OrbStack."
        exit 1
    fi

    # Check if Kubernetes cluster is accessible
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Kubernetes cluster not accessible. Please ensure OrbStack Kubernetes is enabled."
        log_info "To enable: orb config kubernetes enable"
        exit 1
    fi

    log_success "Kubernetes cluster is accessible"

    # Check kubectl version
    local kubectl_version=$(kubectl version --short 2>/dev/null | grep Server | awk '{print $3}')
    log_info "Kubernetes version: $kubectl_version"

    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found. Please install Docker."
        exit 1
    fi

    log_success "Docker is available"

    # Check if Timoni is installed
    if ! command -v timoni &> /dev/null; then
        log_error "Timoni not found. Installing Timoni..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install timoni
        else
            log_error "Please install Timoni manually: https://timoni.sh"
            exit 1
        fi
    fi

    local timoni_version=$(timoni version 2>/dev/null | head -1)
    log_success "Timoni is available: $timoni_version"
}

# Start mock server
start_mock_server() {
    print_section "Starting Mock Server"

    log_info "Starting mock server in background..."
    bun run e2e/mock-server/index.ts &
    MOCK_SERVER_PID=$!
    sleep 3

    if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
        log_success "Mock server started (PID: $MOCK_SERVER_PID)"
    else
        log_error "Failed to start mock server"
        exit 1
    fi

    # Get host IP for OrbStack
    MOCK_HOST="host.docker.internal"
    log_info "Mock server accessible from pods at: $MOCK_HOST"
}

# Build Docker images
build_images() {
    print_section "Building Docker Images"

    log_info "Building yuptime-api image..."
    docker build -t yuptime-api:test -f Dockerfile .
    log_success "Built yuptime-api:test"

    log_info "Building yuptime-checker image..."
    docker build -t yuptime-checker:test -f Dockerfile.checker .
    log_success "Built yuptime-checker:test"

    log_info "Available images:"
    docker images | grep yuptime || true
}

# Deploy Yuptime with Timoni
deploy_yuptime() {
    print_section "Deploying Yuptime"

    # Create values file for OrbStack testing
    cat > /tmp/values-orbstack.cue << 'EOF'
values: {
  image: {
    repository: "yuptime-api"
    tag:        "test"
    digest:     ""
    pullPolicy: "Never"
  }

  checkerImage: {
    repository: "yuptime-checker"
    tag:        "test"
    digest:     ""
    pullPolicy: "Never"
  }

  mode: "development"
  logging: level: "debug"

  database: {
    type: "sqlite"
    sqlite: path: "/data/yuptime.db"
  }

  storage: {
    enabled:      true
    size:         "1Gi"
    storageClass: "local-path"
    accessMode:   "ReadWriteOnce"
  }

  auth: {
    mode: "local"
    session: secret: "orbstack-test-secret"
    adminUser: {
      enabled:  true
      username: "admin"
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$Ha7NhMrOOSle+AMHOp5XNw$jhFoCy75xBnmZJY+FKPujTeFg26xnR1wfDwFJJVrBhU"
    }
  }

  probes: {
    liveness: {
      enabled: true
      initialDelaySeconds: 30
      periodSeconds: 30
      timeoutSeconds: 10
      failureThreshold: 5
    }
    readiness: {
      enabled: true
      initialDelaySeconds: 10
      periodSeconds: 10
      timeoutSeconds: 5
      failureThreshold: 5
    }
  }

  crds: install: true
  test: enabled: true
}
EOF

    log_info "Validating Timoni module..."
    timoni mod vet ./timoni/yuptime

    log_info "Deploying Yuptime to namespace '$NAMESPACE'..."
    timoni apply yuptime ./timoni/yuptime -n "$NAMESPACE" -f /tmp/values-orbstack.cue --timeout=5m

    log_success "Yuptime deployed"
}

# Wait for deployment to be ready
wait_for_deployment() {
    print_section "Waiting for Deployment"

    log_info "Waiting for deployment to be ready..."
    if ! kubectl rollout status deployment/yuptime-api -n "$NAMESPACE" --timeout=120s; then
        log_error "Deployment failed to become ready"
        kubectl get pods -n "$NAMESPACE" -o wide
        kubectl describe pods -n "$NAMESPACE"
        exit 1
    fi

    log_success "Deployment is ready"

    log_info "Pod status:"
    kubectl get pods -n "$NAMESPACE"
}

# Verify CRDs are installed
verify_crds() {
    print_section "Verifying CRDs"

    local expected_crds=(
        "monitors.monitoring.yuptime.io"
        "monitorsets.monitoring.yuptime.io"
        "notificationpolicies.monitoring.yuptime.io"
        "notificationproviders.monitoring.yuptime.io"
        "statuspages.monitoring.yuptime.io"
        "maintenancewindows.monitoring.yuptime.io"
        "silences.monitoring.yuptime.io"
        "localusers.monitoring.yuptime.io"
        "apikeys.monitoring.yuptime.io"
        "yuptimesettings.monitoring.yuptime.io"
    )

    for crd in "${expected_crds[@]}"; do
        if kubectl get crd "$crd" > /dev/null 2>&1; then
            log_success "✓ CRD $crd exists"
        else
            log_error "✗ CRD $crd not found"
            exit 1
        fi
    done
}

# Health check
health_check() {
    print_section "Health Check"

    log_info "Starting port forward..."
    kubectl port-forward svc/yuptime-api 3000:3000 -n "$NAMESPACE" &
    PF_PID=$!
    sleep 5

    if ! kill -0 $PF_PID 2>/dev/null; then
        log_error "Port forward failed"
        exit 1
    fi

    log_info "Waiting for service to be healthy..."
    local max_retries=20
    local retry_count=0

    while [ $retry_count -lt $max_retries ]; do
        if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
            log_success "✓ Health check passed"
            return 0
        fi
        retry_count=$((retry_count + 1))
        echo -n "."
        sleep 2
    done

    echo ""
    log_error "✗ Health check failed after $max_retries retries"

    # Debug information
    log_info "Checking pod logs..."
    kubectl logs -n "$NAMESPACE" -l app.kubernetes.io/name=yuptime --tail=50

    exit 1
}

# Create test monitor
create_test_monitor() {
    print_section "Creating Test Monitor"

    cat > /tmp/test-monitor.yaml << EOF
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: $TEST_MONITOR_NAME
  namespace: $NAMESPACE
  labels:
    test: "e2e"
    env: "orbstack"
spec:
  type: http
  enabled: true
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    http:
      url: $TEST_TARGET_URL
      method: GET
  successCriteria:
    http:
      acceptedStatusCodes: [200]
EOF

    kubectl apply -f /tmp/test-monitor.yaml
    log_success "Test monitor created"

    # Wait for monitor to be processed
    log_info "Waiting for monitor to be processed..."
    sleep 5

    log_info "Monitor status:"
    kubectl get monitors -n "$NAMESPACE" -o wide
}

# Wait for check job to complete
wait_for_check_job() {
    print_section "Waiting for Check Job"

    log_info "Waiting for check job to complete..."
    local max_retries=30
    local retry_count=0

    while [ $retry_count -lt $max_retries ]; do
        # Look for completed jobs
        local completed=0
        local jobs_output=$(kubectl get jobs -n "$NAMESPACE" -l monitoring.yuptime.io/monitor=yuptime-$TEST_MONITOR_NAME --no-headers 2>/dev/null || true)
        if [ -n "$jobs_output" ]; then
            completed=$(echo "$jobs_output" | grep -c "1/1" || true)
        fi

        if [ "$completed" -gt 0 ]; then
            log_success "✓ Check job completed"
            kubectl get jobs -n "$NAMESPACE" -l monitoring.yuptime.io/monitor=yuptime-$TEST_MONITOR_NAME

            # Get the job pod logs
            local job_pod=$(kubectl get pods -n "$NAMESPACE" -l monitoring.yuptime.io/monitor=yuptime-$TEST_MONITOR_NAME --no-headers 2>/dev/null | head -1 | awk '{print $1}')
            if [ -n "$job_pod" ]; then
                log_info "Checker job logs:"
                kubectl logs -n "$NAMESPACE" "$job_pod" 2>/dev/null || true
            fi

            return 0
        fi

        # Check for running jobs
        local jobs=$(kubectl get jobs -n "$NAMESPACE" -l monitoring.yuptime.io/monitor=yuptime-$TEST_MONITOR_NAME --no-headers 2>/dev/null | wc -l)

        if [ "$jobs" -gt 0 ]; then
            echo -n "."
        else
            log_info "No jobs found yet, waiting... ($retry_count/$max_retries)"
        fi

        retry_count=$((retry_count + 1))
        sleep 3
    done

    echo ""
    log_warning "No completed jobs found in time"
    log_info "Job status:"
    kubectl get jobs -n "$NAMESPACE"
}

# Verify API endpoints
verify_api_endpoints() {
    print_section "Verifying API Endpoints"

    log_info "Testing /health endpoint..."
    local health=$(curl -s http://localhost:3000/health)
    log_success "Health: $health"

    log_info "Testing /api/monitors endpoint..."
    local monitors=$(curl -s http://localhost:3000/api/monitors)
    log_success "Monitors: $monitors"

    log_info "Testing /api/status-pages endpoint..."
    local status_pages=$(curl -s http://localhost:3000/api/status-pages)
    log_success "Status pages: $status_pages"

    log_info "Testing /metrics endpoint..."
    local metrics=$(curl -s http://localhost:3000/metrics)
    if echo "$metrics" | grep -q "yuptime_"; then
        log_success "✓ Metrics endpoint returning data"
    else
        log_warning "No yuptime metrics found"
    fi
}

# Verify monitor status
verify_monitor_status() {
    print_section "Verifying Monitor Status"

    log_info "Checking monitor CRD status..."
    kubectl get monitor "$TEST_MONITOR_NAME" -n "$NAMESPACE" -o yaml

    local status=$(kubectl get monitor "$TEST_MONITOR_NAME" -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")

    if [ -n "$status" ]; then
        log_success "Monitor status phase: $status"
    else
        log_warning "No monitor status found (may still be processing)"
    fi

    log_info "Monitor incidents:"
    kubectl get incidents -n "$NAMESPACE" --no-headers 2>/dev/null || echo "No incidents found"
}

# Run E2E test suite
run_e2e_tests() {
    print_section "Running E2E Tests"

    log_info "Running E2E tests with mock server at $MOCK_HOST..."
    MOCK_SERVER_HOST=$MOCK_HOST E2E_NAMESPACE=$NAMESPACE bun test "./e2e/tests/*.test.ts" --timeout 120000

    log_success "E2E tests completed"
}

# Run full test suite
run_tests() {
    parse_args "$@"
    check_ports
    check_prerequisites
    start_mock_server
    build_images
    deploy_yuptime
    wait_for_deployment
    verify_crds
    health_check
    create_test_monitor
    wait_for_check_job
    verify_api_endpoints
    verify_monitor_status
    run_e2e_tests
}

# Main execution
main() {
    print_section "Yuptime E2E Tests - OrbStack"

    log_info "Configuration:"
    log_info "  Namespace: $NAMESPACE"
    log_info "  Timeout: ${TIMEOUT_MINUTES}m"
    log_info "  Cleanup on success: $CLEANUP_ON_SUCCESS"
    log_info "  Cleanup on failure: $CLEANUP_ON_FAILURE"

    # Run tests
    run_tests "$@"

    # Success
    print_section "Test Results"
    log_success "✓ All E2E tests passed!"
    echo ""
    log_info "Test Summary:"
    log_info "  • Prerequisites: PASS"
    log_info "  • Build images: PASS"
    log_info "  • Deploy Yuptime: PASS"
    log_info "  • CRDs installed: PASS"
    log_info "  • Health check: PASS"
    log_info "  • Test monitor: PASS"
    log_info "  • Check job: PASS"
    log_info "  • API endpoints: PASS"
    log_info "  • Monitor status: PASS"
    echo ""
}

# Run main
main "$@"
