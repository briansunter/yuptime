# Helm Chart Publishing

Yuptime automatically publishes Helm charts to GitHub Container Registry (GHCR) on every release.

## How It Works

### CI/CD Pipeline

On every release created by `release-please`:

```
┌─────────────────────────────────────────────────────────┐
│  1. Release Created (e.g., v0.0.9)                     │
│     - release-please creates GitHub tag               │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  2. Build & Push Docker Images                         │
│     - GHCR: ghcr.io/yuptime/yuptime-api:v0.0.9        │
│     - GHCR: ghcr.io/yuptime/yuptime-checker:v0.0.9    │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  3. Generate Artifacts                                │
│     - bun run generate:helm                            │
│     - bun run generate:manifests                       │
│     - bun run validate:generated                      │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  4. Publish Helm Chart                                │
│     - helm package helm/yuptime --version 0.0.9        │
│     - helm push oci://ghcr.io/yuptime/charts           │
│     - Attach to GitHub Release                         │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│  5. Commit Generated Files                            │
│     - git add helm/yuptime/ manifests/                  │
│     - git commit -m "chore: auto-generate..."          │
│     - git push                                        │
└─────────────────────────────────────────────────────────┘
```

## Published Artifacts

### Helm Chart (OCI Registry)

Published to: `oci://ghcr.io/yuptime/charts/yuptime`

**Installation:**
```bash
# Install specific version
helm install yuptime oci://ghcr.io/yuptime/charts/yuptime --version v0.0.9

# Install latest
helm install yuptime oci://ghcr.io/yuptime/charts/yuptime --version latest

# Pull chart for inspection
helm pull oci://ghcr.io/yuptime/charts/yuptime --version v0.0.9
```

### GitHub Release

Every release includes:
- `yuptime-v0.0.9.tgz` - Helm chart tarball
- Release notes
- Docker image tags

### Git Repository

Generated files are committed to the repository:
- `helm/yuptime/` - Helm chart source
- `manifests/` - Static YAML manifests

## Usage Examples

### Install from OCI Registry

```bash
# Login to GHCR (first time only)
helm registry login ghcr.io

# Install
helm install yuptime oci://ghcr.io/yuptime/charts/yuptime --version v0.0.9

# With custom values
helm install yuptime oci://ghcr.io/yuptime/charts/yuptime \
  --set database.type=postgresql \
  --set auth.mode=oidc
```

### Install from Local Chart

```bash
# Clone and use local chart
git clone https://github.com/yuptime/yuptime.git
cd yuptime
helm install yuptime helm/yuptime
```

### Install with Static Manifests

```bash
# Download manifests from release
curl -LO https://github.com/yuptime/yuptime/releases/download/v0.0.9/manifests.tar.gz
tar xzf manifests.tar.gz
kubectl apply -f manifests/
```

## Version Alignment

All artifacts use the same version from `package.json`:

| Artifact | Version | Location |
|----------|---------|----------|
| API Image | `v0.0.9` | `ghcr.io/yuptime/yuptime-api:v0.0.9` |
| Checker Image | `v0.0.9` | `ghcr.io/yuptime/yuptime-checker:v0.0.9` |
| Helm Chart | `v0.0.9` | Chart version & appVersion |
| Timoni Module | `v0.0.9` | `ghcr.io/yuptime/timoni-module:v0.0.9` |

## Development Workflow

### Making Changes

1. **Edit CUE templates** (source of truth):
   ```bash
   vim timoni/yuptime/templates/deployment.cue
   ```

2. **Regenerate artifacts**:
   ```bash
   bun run generate:all
   ```

3. **Validate**:
   ```bash
   bun run validate:generated
   ```

4. **Commit everything**:
   ```bash
   git add timoni/yuptime/ helm/yuptime/ manifests/
   git commit -m "feat: add new feature"
   git push
   ```

### PR Validation

PRs that modify CUE templates are automatically validated:

- ✅ Regenerates Helm chart and manifests
- ✅ Validates Helm chart renders correctly
- ✅ Checks for drift (fails if generated files not updated)
- ⚠️ Posts comment if validation fails

## Troubleshooting

### Helm Chart Not Found

```bash
# Check available versions
helm search repo ghcr.io/yuptime/charts

# List tags
helm registry login ghcr.io
helm show all ghcr.io/yuptime/charts/yuptime
```

### Image Pull Errors

Make sure you're using the correct repository:

```bash
# GitHub Container Registry (default)
--set image.repository=ghcr.io/yuptime/yuptime-api
```

### Chart Version Mismatch

The chart version matches the git tag. To check:

```bash
# From chart
helm show chart ghcr.io/yuptime/charts/yuptime | grep version

# From package.json
grep version package.json
```

## Publishing Checklist

Before publishing, ensure:

- ✅ `package.json` version is updated
- ✅ CUE templates are tested
- ✅ `bun run generate:all` runs without errors
- ✅ `bun run validate:generated` passes
- ✅ Docker images are building correctly
- ✅ All changes are committed

The CI/CD pipeline handles the rest automatically!
