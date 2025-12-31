# Yuptime Static Manifests

This directory contains Kubernetes manifests generated from the CUE templates in `timoni/yuptime/`.

## Files

- `all.yaml` - Combined manifest with all resources
- Individual resource files for customization

## Usage

```bash
# Apply all resources
kubectl apply -f all.yaml

# Or apply individual files
kubectl apply -f namespace.yaml
kubectl apply -f rbac.yaml
kubectl apply -f deployment.yaml
```

## Generated Resources

- Namespace
- ServiceAccount
- ServiceAccount
- ClusterRole
- ClusterRoleBinding
- Role
- RoleBinding
- ConfigMap
- Secret
- Deployment
- Service
- NetworkPolicy
- PodDisruptionBudget

## Regeneration

These manifests are auto-generated from CUE templates. Do not edit manually.

To regenerate: `bun run generate:manifests`
