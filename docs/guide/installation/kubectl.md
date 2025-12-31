# Installing with kubectl

You can install Yuptime using static YAML manifests directly with kubectl. This approach requires no additional tools beyond kubectl.

## Prerequisites

- Kubernetes cluster (1.26+)
- kubectl configured

## Quick Install

### Step 1: Apply CRDs

```bash
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/crds.yaml
```

### Step 2: Create Namespace

```bash
kubectl create namespace yuptime
```

### Step 3: Apply Resources

```bash
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/all.yaml -n yuptime
```

## Verify Installation

```bash
# Check pods
kubectl get pods -n yuptime

# Check CRDs
kubectl get crds | grep yuptime

# Check health
kubectl port-forward -n yuptime svc/yuptime-api 3000:3000 &
curl http://localhost:3000/health
```

## Custom Installation

For custom configurations, download and modify the manifests:

```bash
# Download manifests
curl -LO https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/crds.yaml
curl -LO https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/all.yaml

# Edit all.yaml to customize (see below)
# vim all.yaml

# Apply
kubectl apply -f crds.yaml
kubectl create namespace yuptime
kubectl apply -f all.yaml -n yuptime
```

## Manifest Structure

The `all.yaml` contains:

```yaml
# ServiceAccount
apiVersion: v1
kind: ServiceAccount
metadata:
  name: yuptime
---
# ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: yuptime
rules:
  - apiGroups: ["monitoring.yuptime.io"]
    resources: ["*"]
    verbs: ["get", "list", "watch", "update", "patch"]
  # ... more rules
---
# ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: yuptime
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: yuptime
subjects:
  - kind: ServiceAccount
    name: yuptime
    namespace: yuptime
---
# ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: yuptime-config
data:
  MODE: "production"
  LOG_LEVEL: "info"
---
# Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: yuptime-api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: yuptime-api
  template:
    metadata:
      labels:
        app: yuptime-api
    spec:
      serviceAccountName: yuptime
      containers:
        - name: api
          image: ghcr.io/briansunter/yuptime-api:latest
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: yuptime-config
---
# Service
apiVersion: v1
kind: Service
metadata:
  name: yuptime-api
spec:
  selector:
    app: yuptime-api
  ports:
    - port: 3000
      targetPort: 3000
```

## Common Customizations

### Change Image Version

Edit the Deployment:

```yaml
spec:
  template:
    spec:
      containers:
        - name: api
          image: ghcr.io/briansunter/yuptime-api:0.0.18  # Pin to specific version
```

### Add Resource Limits

```yaml
spec:
  template:
    spec:
      containers:
        - name: api
          resources:
            limits:
              cpu: 1000m
              memory: 1Gi
            requests:
              cpu: 100m
              memory: 256Mi
```

### Change Log Level

Edit the ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: yuptime-config
data:
  MODE: "production"
  LOG_LEVEL: "debug"  # Change from info to debug
```

### Add Node Selector

```yaml
spec:
  template:
    spec:
      nodeSelector:
        kubernetes.io/os: linux
```

## GitOps with Flux

Use Kustomize with Flux:

```yaml
# kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: yuptime
resources:
  - https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/crds.yaml
  - https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/all.yaml

patches:
  - target:
      kind: ConfigMap
      name: yuptime-config
    patch: |
      - op: replace
        path: /data/LOG_LEVEL
        value: info
```

Flux Kustomization:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: yuptime
  namespace: flux-system
spec:
  interval: 5m
  targetNamespace: yuptime
  sourceRef:
    kind: GitRepository
    name: fleet-infra
  path: ./clusters/my-cluster/yuptime
  prune: true
  wait: true
```

## Upgrading

```bash
# Re-apply manifests
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/crds.yaml
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/all.yaml -n yuptime

# Restart deployment
kubectl rollout restart deployment/yuptime-api -n yuptime
```

## Uninstalling

```bash
# Delete resources
kubectl delete -f all.yaml -n yuptime
kubectl delete namespace yuptime

# Delete CRDs (optional, removes all monitors!)
kubectl delete -f crds.yaml
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n yuptime -o wide
kubectl describe pod -n yuptime -l app=yuptime-api
```

### View Logs

```bash
kubectl logs -n yuptime -l app=yuptime-api -f
```

### Check RBAC

```bash
kubectl auth can-i get monitors --as=system:serviceaccount:yuptime:yuptime -n yuptime
kubectl auth can-i patch monitors/status --as=system:serviceaccount:yuptime:yuptime -n yuptime
```
