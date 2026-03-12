# Installing With kubectl

Use the checked-in static manifests if you want a plain `kubectl` workflow. Apply CRDs from `k8s/crds.yaml` first, then apply the generated workload manifests from `manifests/all.yaml`.

## Quick Install

```bash
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/k8s/crds.yaml
kubectl create namespace yuptime
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/all.yaml -n yuptime
```

## Verify

```bash
kubectl get pods -n yuptime
kubectl get crds | grep yuptime
kubectl port-forward -n yuptime svc/yuptime-api 3000:3000
curl http://localhost:3000/health
```

## Custom Install

```bash
curl -LO https://raw.githubusercontent.com/briansunter/yuptime/master/k8s/crds.yaml
curl -LO https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/all.yaml

kubectl apply -f crds.yaml
kubectl create namespace yuptime
kubectl apply -f all.yaml -n yuptime
```

## GitOps Note

The Timoni CUE module under `timoni/yuptime/` is authoritative. The static manifests are a mirror for kubectl-style installs. If you customize CRDs or deployment packaging, update the Timoni module first and then sync the checked-in mirrors.
