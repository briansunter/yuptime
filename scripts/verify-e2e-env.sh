#!/bin/bash
# Verify E2E test environment is ready

echo "🔍 Yuptime E2E Environment Verification"
echo "======================================="
echo ""

PASS_COUNT=0
FAIL_COUNT=0

check_pass() {
    echo "✓ $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

check_fail() {
    echo "✗ $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

# Check OrbStack
echo "Checking OrbStack..."
if command -v orb &> /dev/null; then
    check_pass "OrbStack CLI installed"
    ORB_VERSION=$(orb version 2>/dev/null || echo "unknown")
    echo "  Version: $ORB_VERSION"
else
    check_fail "OrbStack CLI not found (install: brew install --cask orbstack)"
fi

# Check Kubernetes
echo ""
echo "Checking Kubernetes..."
if kubectl cluster-info &> /dev/null; then
    check_pass "Kubernetes cluster accessible"
    K8S_VERSION=$(kubectl version --short 2>/dev/null | grep Server | awk '{print $3}' || echo "unknown")
    echo "  Version: $K8S_VERSION"
    echo "  Context: $(kubectl config current-context)"
else
    check_fail "Kubernetes cluster not accessible (enable: orb config kubernetes enable)"
fi

# Check Docker
echo ""
echo "Checking Docker..."
if command -v docker &> /dev/null; then
    check_pass "Docker installed"
    DOCKER_VERSION=$(docker --version 2>/dev/null || echo "unknown")
    echo "  $DOCKER_VERSION"
else
    check_fail "Docker not found"
fi

# Check Timoni
echo ""
echo "Checking Timoni..."
if command -v timoni &> /dev/null; then
    check_pass "Timoni installed"
    TIMONI_VERSION=$(timoni version 2>/dev/null | head -1 || echo "unknown")
    echo "  $TIMONI_VERSION"
else
    check_fail "Timoni not found (install: brew install timoni)"
fi

# Check kubectl
echo ""
echo "Checking kubectl..."
if command -v kubectl &> /dev/null; then
    check_pass "kubectl installed"
    KCTL_VERSION=$(kubectl version --short --client 2>/dev/null || echo "unknown")
    echo "  $KCTL_VERSION"
else
    check_fail "kubectl not found (install: brew install kubectl)"
fi

# Check Bun
echo ""
echo "Checking Bun..."
if command -v bun &> /dev/null; then
    check_pass "Bun installed"
    BUN_VERSION=$(bun --version 2>/dev/null || echo "unknown")
    echo "  Version: $BUN_VERSION"
else
    check_fail "Bun not found"
fi

# Check if we can build Docker images
echo ""
echo "Checking Docker build capability..."
if command -v docker &> /dev/null && [ -f "Dockerfile" ] && [ -f "Dockerfile.checker" ]; then
    check_pass "Dockerfiles present"
    echo "  Dockerfile: $(head -1 Dockerfile | cut -d' ' -f3-)"
    echo "  Dockerfile.checker: $(head -1 Dockerfile.checker | cut -d' ' -f3-)"
else
    check_fail "Cannot build Docker images"
fi

# Check Timoni module
echo ""
echo "Checking Timoni module..."
if [ -d "timoni/yuptime" ]; then
    check_pass "Timoni module directory exists"
    if command -v timoni &> /dev/null; then
        echo "  Module: $(timoni mod ls timoni/yuptime 2>/dev/null || echo 'yuptime')"
    fi
else
    check_fail "Timoni module not found"
fi

# Summary
echo ""
echo "======================================="
echo "Summary: $PASS_COUNT passed, $FAIL_COUNT failed"
echo "======================================="

if [ $FAIL_COUNT -eq 0 ]; then
    echo ""
    echo "✅ Environment ready for E2E tests!"
    echo ""
    echo "Run tests with:"
    echo "  bun run e2e              # Full test suite"
    echo "  bun run e2e:keep         # Keep resources for debugging"
    echo "  ./scripts/e2e-orbstack.sh --help  # Show all options"
    exit 0
else
    echo ""
    echo "❌ Environment not ready. Please install missing dependencies."
    echo ""
    echo "Quick setup:"
    echo "  brew install --cask orbstack  # OrbStack + Kubernetes"
    echo "  brew install timoni kubectl   # CLIs"
    echo "  orb config kubernetes enable  # Enable K8s"
    exit 1
fi
