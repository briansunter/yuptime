# Kubernetes Monitor

Kubernetes monitors use the `k8s` monitor type and inspect in-cluster resources such as Deployments, StatefulSets, Services, and Pods.

## Basic Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: api-deployment
  namespace: yuptime
spec:
  type: k8s
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    kubernetes:
      namespace: production
      name: api
      kind: Deployment
      minReadyReplicas: 2
```

## Target Fields

```yaml
target:
  kubernetes:
    namespace: production
    name: my-app
    kind: Deployment
    minReadyReplicas: 1
```

Supported kinds:

- `Deployment`
- `StatefulSet`
- `Service`
- `Pod`

## Example With Alertmanager

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: web-deployment
  namespace: yuptime
spec:
  type: k8s
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    kubernetes:
      namespace: production
      name: web-frontend
      kind: Deployment
      minReadyReplicas: 3
  alertmanagerUrl: "http://alertmanager.monitoring:9093/api/v2/alerts"
```
