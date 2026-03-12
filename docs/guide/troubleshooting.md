# Troubleshooting

## CRDs Not Found

If `kubectl` reports that `Monitor` or other Yuptime resources do not exist, re-apply the CRDs:

```bash
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/k8s/crds.yaml
```

## Pod Or Controller Issues

```bash
kubectl get pods -n yuptime -o wide
kubectl describe pod -n yuptime -l app=yuptime-api
kubectl logs -n yuptime -l app=yuptime-api --previous
```

## RBAC Checks

```bash
kubectl get sa yuptime -n yuptime
kubectl get clusterrolebinding | grep yuptime
kubectl auth can-i get monitors --as=system:serviceaccount:yuptime:yuptime -n yuptime
kubectl auth can-i patch monitors/status --as=system:serviceaccount:yuptime:yuptime-checker -n yuptime
```

## Monitor Jobs

```bash
kubectl get monitor my-monitor -n yuptime -o yaml
kubectl get jobs -n yuptime
kubectl logs -n yuptime job/<job-name>
```

## HTTP Target Failures

```bash
kubectl run test-curl --rm -it --image=curlimages/curl --restart=Never -- \
  curl -v https://api.example.com/health
```

If you need explicit DNS resolvers, configure them under `target.http.dns.resolvers`:

```yaml
target:
  http:
    url: "https://api.example.com"
    dns:
      resolvers:
        - "8.8.8.8"
        - "1.1.1.1"
```

For development-only TLS bypasses, use `target.http.tls.verify: false`.

## Alertmanager Connectivity

```bash
kubectl run test-curl --rm -it --image=curlimages/curl --restart=Never -- \
  curl http://alertmanager.monitoring:9093/-/ready
kubectl logs -n yuptime -l app=yuptime-api | grep -i alert
```

## Common Errors

- `no matches for kind "Monitor"`: CRDs were not applied from `k8s/crds.yaml`.
- `forbidden`: RBAC is missing or out of date.
- `connection refused`: the target is unreachable from inside the cluster.
- `certificate signed by unknown authority`: use the correct CA bundle or set `tls.verify: false` only for development.
