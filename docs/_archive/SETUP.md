# Setup Guide

## Prerequisites

- Bun 1.1.0+ ([Install](https://bun.sh))
- Node.js 20+ (for frontend development)
- Kubernetes cluster 1.24+ (for deployment)
- Docker (for building container images)

## Development Setup

### 1. Clone and Install Dependencies

```bash
cd kubekuma
bun install
```

### 2. Setup Environment

```bash
cp .env.example .env.local

# Edit .env.local with your settings
# DATABASE_URL=sqlite:./kubekuma.db (default, recommended for dev)
# AUTH_MODE=local (or oidc)
# PORT=3000
```

### 3. Run Backend Server

```bash
bun run dev
```

The API server will start on `http://localhost:3000`

Endpoints:
- `/health` - Health check
- `/ready` - Readiness probe
- `/api/v1/*` - API endpoints
- `/` - Frontend (once built)

### 4. Frontend Development (in another terminal)

```bash
cd web
bun install
bun run dev
```

Frontend dev server starts on `http://localhost:5173`

The Vite dev server proxies `/api` requests to the backend.

### 5. Access the Application

- **Frontend**: http://localhost:5173 (development)
- **API**: http://localhost:3000/api/v1
- **Health**: http://localhost:3000/health

## Database Setup

### SQLite (Default)

SQLite database file will be created at `./kubekuma.db`

```bash
# Generate migrations (if needed)
bun run db:generate

# Push schema to database
bun run db:push
```

### PostgreSQL

For production deployments:

```bash
# Update .env.local
DATABASE_URL=postgresql://user:password@localhost:5432/kubekuma

# Run migrations
bun run db:push
```

## Building for Deployment

### Build Backend

```bash
bun run build
```

This creates:
- Compiled TypeScript in `dist/`
- Frontend build in `web/dist/`

### Build Container Image

```bash
docker build -t kubekuma:latest .
```

## Kubernetes Deployment

### 1. Create Namespace

```bash
kubectl create namespace monitoring
```

### 2. Install CRDs

```bash
kubectl apply -f k8s/crds/
```

### 3. Deploy with Timoni

```bash
timoni mod pull oci://ghcr.io/kubekuma/timoni/kubekuma -o ./timoni/kubekuma
timoni bundle apply kubekuma -n monitoring -f values.yaml
```

Or manually apply manifests:

```bash
kubectl apply -f k8s/manifests/
```

### 4. Create Initial Settings

```bash
kubectl apply -f - <<EOF
apiVersion: monitoring.kubekuma.io/v1
kind: KubeKumaSettings
metadata:
  name: kubekuma
spec:
  auth:
    mode: local
    local:
      allowSignup: false
  scheduler:
    minIntervalSeconds: 20
    maxConcurrentNetChecks: 200
EOF
```

### 5. Access the UI

```bash
# Port forward to access locally
kubectl port-forward -n monitoring svc/kubekuma 3000:3000

# Or use Ingress (if configured)
# http://kubekuma.example.com
```

## Troubleshooting

### Backend won't start

Check logs:
```bash
bun run dev 2>&1 | grep -i error
```

Common issues:
- `DATABASE_URL` not set or invalid
- Port 3000 already in use
- Kubernetes client not accessible

### Frontend dev server issues

```bash
cd web
rm -rf node_modules dist
bun install
bun run dev
```

### Database migration errors

```bash
# Reset database (development only!)
rm kubekuma.db
bun run db:push
```

### Kubernetes issues

Check KubeKuma pod status:
```bash
kubectl get pods -n monitoring
kubectl logs -n monitoring deployment/kubekuma
kubectl describe pod -n monitoring kubekuma-xxx
```

Check CRDs are installed:
```bash
kubectl api-resources | grep kubekuma
```

## Development Workflow

### 1. Backend Changes

Edit files in `src/` and the server will hot-reload (if using a file watcher)

For database schema changes:
```bash
# Edit src/db/schema/
bun run db:generate  # Create migration
bun run db:push      # Apply migration
```

### 2. Frontend Changes

Edit files in `web/src/` - Vite will hot reload automatically

### 3. CRD Type Changes

Edit files in `src/types/crd/` - TypeScript will check types

### 4. Adding New Monitor Types

1. Create checker in `src/checkers/[type].ts`
2. Add to `executeCheck()` in `src/checkers/index.ts`
3. Update Monitor CRD type definition in `src/types/crd/monitor.ts`

## Performance Tuning

### Scheduler Concurrency

In KubeKumaSettings:
```yaml
scheduler:
  maxConcurrentNetChecks: 200  # Network checks (HTTP, TCP, DNS)
  maxConcurrentPrivChecks: 20   # Privileged checks (ping, k8s)
```

### Database Connection Pool

For PostgreSQL, adjust in `src/db/index.ts`

### Frontend Caching

Update Vite cache settings in `web/vite.config.ts`

## Testing

### Unit Tests

```bash
# (To be implemented)
```

### Integration Tests

```bash
# (To be implemented)
```

### Manual Testing

Create test monitors:

```bash
kubectl apply -f - <<EOF
apiVersion: monitoring.kubekuma.io/v1
kind: Monitor
metadata:
  name: test-http
  namespace: monitoring
spec:
  enabled: true
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    http:
      url: https://httpbin.org/get
  successCriteria:
    http:
      acceptedStatusCodes: [200]
EOF
```

Check status:

```bash
kubectl get monitors -n monitoring
kubectl describe monitor test-http -n monitoring
```

## Production Deployment

### Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure persistent storage (PostgreSQL or SQLite with PVC)
- [ ] Enable OIDC authentication
- [ ] Setup Ingress with TLS
- [ ] Configure resource limits and requests
- [ ] Setup monitoring and logging
- [ ] Configure backups
- [ ] Security: RBAC, network policies
- [ ] Configure alert providers (Slack, etc.)

### Security Considerations

1. **Authentication**: Use OIDC for production
2. **Secrets**: All credentials in Kubernetes Secrets, never in CRDs
3. **RBAC**: Restrict KubeKuma ServiceAccount permissions
4. **Network**: Use NetworkPolicies to restrict access
5. **TLS**: All external connections over HTTPS

## Support

- Check logs: `kubectl logs -f -n monitoring deployment/kubekuma`
- Review CRD statuses: `kubectl get monitors -o yaml`
- Check Kubernetes events: `kubectl describe`
