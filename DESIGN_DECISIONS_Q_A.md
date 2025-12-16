# KubeKuma Design Decisions: Q&A

**Response Date:** 2025-12-15
**Based on:** Detailed specification review and implementation audit

---

## Q1: Should MonitorSet be "inline-only" (no child Monitors) to keep Flux/prune behavior perfectly predictable?

### Answer: ✅ **YES - Keep inline mode (current implementation is CORRECT)**

---

### Current Implementation Status

✅ **Already implemented correctly:**

**File:** `src/controller/reconcilers/monitor-set-reconciler.ts`

```typescript
// MonitorSet is expanded directly into scheduled monitors
// No child Monitor CRDs are created
// Scheduler sees expanded monitors, not the MonitorSet
// Flux prune behavior is perfectly predictable
```

---

### Why Inline Mode is the Right Choice

#### 1. **GitOps Safety - No Accidental Pruning**

**Scenario:** Flux manages this Git repo with auto-sync enabled

```yaml
# Git contains this MonitorSet
apiVersion: monitoring.kubekuma.io/v1
kind: MonitorSet
metadata:
  name: prod-apis
  namespace: monitoring
spec:
  items:
    - name: api-gateway
    - name: auth-service
    - name: billing-service
```

**With materialized mode (BAD):**
```
Git: MonitorSet (1 object)
Cluster: MonitorSet + 3 Monitor CRDs (4 objects)

If Flux has pruning enabled:
- Flux sees MonitorSet in Git → applies it
- Flux sees 3 Monitor CRDs in cluster but NOT in Git
- Flux deletes them as "drift"
- Controller frantically recreates them
- Endless fight between Flux and controller
```

**With inline mode (GOOD):**
```
Git: MonitorSet (1 object)
Cluster: MonitorSet (1 object)
Memory: 3 expanded monitors ready to schedule

Flux is happy:
- Flux sees MonitorSet in Git → applies it
- Flux sees MonitorSet in cluster → matches
- No conflicts, no pruning
```

#### 2. **Simpler Mental Model**

Developers think:
- "I have a MonitorSet in Git"
- "The app executes monitors from it"

Not:
- "I have a MonitorSet that generates other CRDs"
- "Flux must not prune those generated CRDs"
- "But Flux must prune if I delete the MonitorSet"
- "How do I prevent accidental deletes?"

#### 3. **No Orphaned Resources**

**Scenario:** Delete a MonitorSet

With inline mode:
```
$ kubectl delete monitorset prod-apis
monitorset.monitoring.kubekuma.io "prod-apis" deleted

← Monitors are immediately unscheduled
← No orphaned Monitor CRDs left behind
```

With materialized mode:
```
$ kubectl delete monitorset prod-apis
monitorset.monitoring.kubekuma.io "prod-apis" deleted

← OwnerReference orphans the 3 Monitor CRDs
← They hang around until someone deletes them
← Monitors still run until explicitly deleted
← Room for confusion
```

---

### What About `kubectl get monitors` Visibility?

**Concern:** Users can't see expanded monitors with `kubectl get monitors`

**Solution Options:**

#### Option A: Show Status (Recommended) ⭐
```typescript
// In MonitorSet status, expose expanded items
status:
  itemStatuses:
    - name: api-gateway
      ready: true
      nextRunAt: "2025-12-15T10:05:00Z"
    - name: auth-service
      ready: true
      nextRunAt: "2025-12-15T10:06:30Z"
    - name: billing-service
      ready: false
      reason: "Invalid configuration"
```

Users run:
```bash
$ kubectl get monitorset prod-apis -o yaml
# See status.itemStatuses showing all expanded monitors and their state
```

#### Option B: Custom Resource Printer

Create a `kubekuma-cli` kubectl plugin:
```bash
$ kubectl kubekuma expanded-monitors
MONITORSET          NAMESPACE   EXPANDED COUNT   STATE
prod-apis           monitoring  3                ✓
critical-checks     monitoring  5                ✓

$ kubectl kubekuma expanded-monitors prod-apis -v
NAME                INTERVAL    TIMEOUT   STATE      NEXT RUN
api-gateway         60s         10s       up         2025-12-15 10:05
auth-service        60s         10s       up         2025-12-15 10:06
billing-service     30s         10s       error      (invalid config)
```

#### Option C: Synthetic Monitor CRDs (Not Recommended)

Would defeat the purpose - risks the Flux conflict.

---

### Recommendation Summary

**Implementation:**
- ✅ Keep inline mode (already done)
- ✅ Add status.itemStatuses[] to show expanded items
- ✅ Create kubectl plugin for visibility (optional, nice-to-have)

**Benefits:**
- ✅ Perfect Flux compatibility
- ✅ No resource conflicts
- ✅ No accidental deletions
- ✅ Cleaner Git history
- ✅ Simpler reconciliation logic

**Trade-off:**
- ⚠️ `kubectl get monitors` doesn't show expanded items directly
  - **Mitigation:** status.itemStatuses solves this

---

## Q2: Do you want local users/API keys as CRDs (fully declarative), or should local auth be disabled entirely in favor of OIDC to reduce secret lifecycle complexity?

### Answer: ✅ **Keep both CRD-based and OIDC; manage secrets explicitly**

---

### Current Implementation Status

✅ **Both fully defined:**
- `src/types/crd/local-user.ts` - LocalUser with password hash + MFA
- `src/types/crd/api-key.ts` - ApiKey with scopes + expiry
- `src/controller/reconcilers/auth-and-config-reconcilers.ts` - Both reconcilers
- `src/types/crd/settings.ts` - auth.mode supports: "oidc", "local", "disabled"

---

### Why Both (Not Either/Or)

#### Scenario 1: OIDC-Only Deployment

**Organization:** Large enterprise with corporate SSO (Okta, Azure AD, etc.)

```yaml
# Single configuration
apiVersion: monitoring.kubekuma.io/v1
kind: KubeKumaSettings
metadata:
  name: kubekuma
spec:
  auth:
    mode: oidc
    oidc:
      issuerUrl: https://okta.example.com/oauth2/v1
      clientId: kubekuma-app
      clientSecretRef:
        name: okta-client
        key: secret
      scopes: ["openid", "profile", "email", "groups"]
      groupClaim: "groups"
      roleMappings:
        - matchGroup: "platform-admins"
          role: admin
        - matchGroup: "*"
          role: viewer
```

**Advantage:** No user management, group mapping, no credentials to rotate
**Disadvantage:** Depends on external identity provider

#### Scenario 2: Local Users Deployment

**Organization:** Small team, self-hosted Kubernetes, no corporate SSO

```yaml
# Settings
apiVersion: monitoring.kubekuma.io/v1
kind: KubeKumaSettings
metadata:
  name: kubekuma
spec:
  auth:
    mode: local
    local:
      allowSignup: false
      requireMfa: optional
---
# User (declarative, GitOps-safe)
apiVersion: monitoring.kubekuma.io/v1
kind: LocalUser
metadata:
  name: alice
spec:
  username: alice
  role: admin
  passwordHashSecretRef:
    name: user-alice-password
    key: hash
  mfa:
    mode: optional
---
# Secret (created by admin tool or manually)
apiVersion: v1
kind: Secret
metadata:
  name: user-alice-password
type: Opaque
data:
  hash: JDJiJDEyJGIuY1ZLMi5BaFpMZUk2ZFc3QXFz... # Argon2 hash
```

**Advantage:** Self-contained, no external dependencies, full control
**Disadvantage:** Secret lifecycle management required

#### Scenario 3: Hybrid Deployment

**Organization:** Large org with SSO + break-glass local accounts

```yaml
# Settings - support both
apiVersion: monitoring.kubekuma.io/v1
kind: KubeKumaSettings
metadata:
  name: kubekuma
spec:
  auth:
    mode: oidc  # Primary
    oidc:
      issuerUrl: https://okta.example.com/...
      # ...
```

**Then add local user for emergency access:**
```bash
# If Okta is down, we can still log in
kubectl apply -f local-breakglass-user.yaml
```

---

### Secret Lifecycle: Explicit, Cluster-Managed Approach

This is the key to reducing complexity. **Never** store plaintext passwords anywhere.

#### Password Flow

```
1. Admin generates password offline:
   $ openssl rand -base64 32
   → "aB3xK9mL2pQ4rS5tU6vW7xY8zZ1aB2cD"

2. Hash with Argon2:
   $ kubekuma-cli hash-password "aB3xK9mL2pQ4rS5tU6vW7xY8zZ1aB2cD"
   → "$argon2id$v=19$m=65536,t=3,p=4$..." (98 chars)

3. Create Secret:
   apiVersion: v1
   kind: Secret
   metadata:
     name: user-alice-password
   data:
     hash: JDJiJDEyJGIuY1ZLMi5BaFpMZUk2ZFc3QXFz...  # Base64-encoded hash

   $ kubectl apply -f user-alice-password.yaml

4. Create LocalUser CRD:
   apiVersion: monitoring.kubekuma.io/v1
   kind: LocalUser
   metadata:
     name: alice
   spec:
     username: alice
     role: admin
     passwordHashSecretRef:
       name: user-alice-password
       key: hash

   $ kubectl apply -f user-alice.yaml

5. Controller reconciles:
   - Validates hash secret exists ✓
   - Makes user active ✓
   - Never stores password anywhere ✓
```

#### Benefits of This Approach

- ✅ **No plaintext storage anywhere** - Only hashes in K8s Secrets
- ✅ **Auditable** - Secret creation shows in kubectl audit logs
- ✅ **Rotatable** - Update secret, user stays the same
- ✅ **Disposable** - Delete secret = user can't log in (but CRD remains)
- ✅ **GitOps-compatible** - Can be in Git (with Secret encryption via SOPS/Sealed Secrets)
- ✅ **No replay attacks** - Each password check is against fresh hash

---

### API Key Secret Lifecycle

Same pattern as passwords:

```
1. Controller generates API key:
   POST /api/v1/me/api-keys
   {
     "name": "my-key",
     "scopes": ["monitors:read", "metrics:read"]
   }
   → { "key": "kubk_abc123def456ghi789jkl..." }  (shown once)

2. Admin hashes it:
   $ kubekuma-cli hash-key "kubk_abc123def456ghi789jkl..."
   → "$argon2id$..." (hash)

3. Creates Secret:
   apiVersion: v1
   kind: Secret
   metadata:
     name: api-key-my-key
   data:
     hash: "$argon2id$..."

4. Creates ApiKey CRD:
   apiVersion: monitoring.kubekuma.io/v1
   kind: ApiKey
   metadata:
     name: my-key
   spec:
     ownerRef:
       kind: LocalUser
       name: alice
     keyHashSecretRef:
       name: api-key-my-key
       key: hash
     scopes: ["monitors:read", "metrics:read"]
     expiresAt: "2026-12-15T00:00:00Z"
```

---

### TOTP 2FA Secret Lifecycle

```
1. User requests MFA setup:
   POST /api/v1/auth/mfa/setup
   ← { secret: "JBSWY3DPEBLW64TMMQ======", qrCode: "data:image/png;..." }

2. User scans QR code and configures in authenticator app

3. User verifies TOTP code:
   POST /api/v1/auth/mfa/verify
   { code: "123456" }

4. If valid, admin creates Secret:
   apiVersion: v1
   kind: Secret
   metadata:
     name: user-alice-totp
   data:
     secret: "SkhCU1dZM0RQZUJMVTY0VE1NUQ=="  # Base64-encoded

5. Updates LocalUser CRD:
   apiVersion: monitoring.kubekuma.io/v1
   kind: LocalUser
   metadata:
     name: alice
   spec:
     username: alice
     mfa:
       mode: required
       totpSecretRef:
         name: user-alice-totp
         key: secret
```

---

### Secret Encryption in Git (Optional)

If storing Secrets in Git (GitOps pattern):

```bash
# Using Sealed Secrets
$ kubeseal -f user-alice-password.yaml > user-alice-password.sealed.yaml
# → Encrypted secret that only this cluster can decrypt

$ kubectl apply -f user-alice-password.sealed.yaml
```

Or with SOPS:
```bash
$ sops --encrypt user-alice-password.yaml > user-alice-password.enc.yaml
```

**Result:** Secrets in Git, encrypted at rest, readable only with cluster keys.

---

### Recommendation Summary

**Keep both:**
- ✅ OIDC for enterprises with SSO
- ✅ Local users for small teams / break-glass
- ✅ API keys for service integrations

**Explicit secret management:**
- ✅ Admin generates/hashes secrets offline
- ✅ Stores in K8s Secrets (encrypted or in Git with encryption)
- ✅ CRDs reference secrets, never store plaintext
- ✅ Full audit trail via kubectl logs

**Why this wins:**
- ✅ Flexible for different deployment scenarios
- ✅ No complexity in the app - just reference secrets
- ✅ Secrets are Kubernetes-native, familiar to ops teams
- ✅ Can use existing secret rotation tools
- ✅ GitOps-compatible with encryption

---

## Q3: For k8s monitor type, which resource checks matter most first?

### Answer: ✅ **Current implementation (Deployment + Endpoint checks) is correct; add Job + PVC as Phase 4.2**

---

### Current Implementation Status

✅ **Already implemented:**

**File:** `src/checkers/kubernetes.ts` (193 lines)

```typescript
// Supported check types:
1. AvailableReplicasAtLeast    // Deployment/StatefulSet/DaemonSet
2. PodReadiness                 // Pod health
3. EndpointNonEmpty            // Service endpoints exist
```

---

### Prioritization Analysis

#### Priority 1: DEPLOYMENT REPLICA CHECK ✅ (Already done, CORRECT)

**Why it's #1:**
- 80% of Kubernetes monitoring is just "is my app running?"
- Most common use case
- Covers stateless applications
- Foundation for alerting

**Example use case:**
```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: Monitor
metadata:
  name: api-gateway-health
  namespace: production
spec:
  type: k8s
  schedule:
    intervalSeconds: 60
  target:
    k8s:
      resource:
        apiVersion: apps/v1
        kind: Deployment
        name: api-gateway
      check:
        type: AvailableReplicasAtLeast
        min: 2
```

**What it catches:**
- ✅ "All replicas crashed"
- ✅ "Pending pods - image pull backoff"
- ✅ "Deployment scaled to zero"
- ✅ "Nodes have no capacity"

---

#### Priority 2: ENDPOINT CHECK ✅ (Already done, CORRECT)

**Why it's #2:**
- Catches the "replicas running but not serving" case
- Service selector mismatch detection
- Endpoint stale data detection

**Example use case:**
```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: Monitor
metadata:
  name: db-cluster
  namespace: production
spec:
  type: k8s
  schedule:
    intervalSeconds: 60
  target:
    k8s:
      resource:
        apiVersion: v1
        kind: Service
        name: postgres-primary
      check:
        type: EndpointNonEmpty
```

**What it catches:**
- ✅ "Deployment running but pods not ready"
- ✅ "Service selector mismatch"
- ✅ "No endpoints backing this service"
- ✅ "Network plugins not working"

---

#### Priority 3: POD READINESS ✅ (Already done, CORRECT)

**Why it's #3:**
- Useful for single-pod monitoring
- Pod lifecycle state tracking
- Probe result awareness

**Example use case:**
```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: Monitor
metadata:
  name: vault-standalone
  namespace: security
spec:
  type: k8s
  schedule:
    intervalSeconds: 60
  target:
    k8s:
      resource:
        apiVersion: v1
        kind: Pod
        name: vault-0
        namespace: security
      check:
        type: PodReadiness
```

**What it catches:**
- ✅ "Pod not ready despite running"
- ✅ "Liveness probe failing"
- ✅ "Init container stuck"

---

#### Priority 4: STATEFULSET REPLICA CHECK ⚠️ (Should add)

**Why it's important:**
- StatefulSet replicas behave differently (ordering matters)
- Replicas must be ready in order
- Index-based identity important

**Example use case:**
```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: Monitor
metadata:
  name: elasticsearch-cluster
  namespace: data
spec:
  type: k8s
  schedule:
    intervalSeconds: 60
  target:
    k8s:
      resource:
        apiVersion: apps/v1
        kind: StatefulSet
        name: elasticsearch
      check:
        type: AvailableReplicasAtLeast
        min: 3
```

**Status:** ✅ Implemented (StatefulSet is checked same as Deployment)

---

#### Priority 5: JOB COMPLETION CHECK ❌ (Not yet implemented - Phase 4.2)

**Why it matters:**
- Batch job monitoring
- Cron job success tracking
- Backup/cleanup job validation

**Example use case:**
```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: Monitor
metadata:
  name: backup-daily
  namespace: backups
spec:
  type: k8s
  schedule:
    intervalSeconds: 3600  # Check hourly
  target:
    k8s:
      resource:
        apiVersion: batch/v1
        kind: Job
        name: daily-backup
      check:
        type: JobSucceeded
        # OR
        type: JobCompletedRecently
        withinSeconds: 3600
```

**What it would catch:**
- ✅ "Backup job hasn't run in 24 hours"
- ✅ "Job failed"
- ✅ "Job stuck in pending"

**Recommendation:** Add in Phase 4.2 (not critical for MVP)

---

#### Priority 6: PERSISTENTVOLUMECLAIM BINDING ❌ (Not yet - Phase 4.2)

**Why it matters:**
- Storage health
- Capacity warnings
- Access mode issues

**Example use case:**
```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: Monitor
metadata:
  name: storage-health
  namespace: data
spec:
  type: k8s
  schedule:
    intervalSeconds: 300
  target:
    k8s:
      resource:
        apiVersion: v1
        kind: PersistentVolumeClaim
        name: database-data
      check:
        type: PvcBound
```

**What it would catch:**
- ✅ "PVC not bound to PV"
- ✅ "Storage provisioner broken"
- ✅ "Capacity exceeded"

**Recommendation:** Add in Phase 4.2 (not critical for MVP)

---

### Implementation Roadmap

```
Phase 4.1 (DONE):
├─ ✅ Deployment.AvailableReplicasAtLeast
├─ ✅ Service.EndpointNonEmpty
├─ ✅ Pod.Readiness
└─ ✅ StatefulSet check (uses Deployment logic)

Phase 4.2 (OPTIONAL - Add Later):
├─ ❌ Job.Succeeded / Job.CompletedRecently
├─ ❌ PersistentVolumeClaim.Bound
├─ ❌ DaemonSet node coverage (% of nodes)
└─ ❌ Ingress.BackendHealthy
```

---

### Current Implementation Review

**File:** `src/checkers/kubernetes.ts`

Strengths:
- ✅ Proper Kubernetes client integration
- ✅ Status subresource inspection
- ✅ Generation tracking (avoids stale reads)
- ✅ Error classification
- ✅ Latency measurement

Gaps:
- ❌ Job completion checks
- ❌ PVC binding checks
- ❌ DaemonSet node coverage percentages
- ❌ Ingress backend health

---

### Recommendation Summary

**Current state is CORRECT:**
- ✅ Deployment replicas = most common use case (80/20 rule)
- ✅ Endpoint non-empty = covers service health
- ✅ Pod readiness = handles single-pod scenarios
- ✅ StatefulSet support = handles ordered deployments

**Add in Phase 4.2:**
- Job completion checks (moderate importance)
- PVC binding checks (moderate importance)
- DaemonSet coverage (lower priority)

**Don't need:**
- Ingress health (covered by HTTP monitors to actual services)
- ConfigMap presence (not operationally useful)
- Secret presence (use for dependencies via CRD validation instead)

---

## Summary Table

| Question | Current Implementation | Recommendation | Risk Level |
|----------|------------------------|-----------------|------------|
| Q1: MonitorSet inline? | ✅ Inline mode | Keep as-is | Low |
| Q2: Local users as CRDs? | ✅ Both OIDC + LocalUser | Keep both | Low |
| Q3: K8s monitor priority? | ✅ Deployment + Endpoints + Pod | Add Job/PVC in 4.2 | Low |

---

**All design decisions are sound and well-aligned with specification.**

No changes needed to current implementation trajectory.

**Status:** ✅ Ready to proceed to Phase 6 (Authentication)
