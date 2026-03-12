# MonitorSet

`MonitorSet` groups multiple inline monitor specs under shared defaults.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MonitorSet
metadata:
  name: api-endpoints
  namespace: yuptime
spec:
  defaults:
    schedule:
      intervalSeconds: 60
      timeoutSeconds: 30
    successCriteria:
      http:
        acceptedStatusCodes: [200]
    alertmanagerUrl: "http://alertmanager.monitoring:9093/api/v1/alerts"
  items:
    - name: users-api
      spec:
        type: http
        target:
          http:
            url: "https://api.example.com/users"
    - name: orders-api
      spec:
        type: http
        target:
          http:
            url: "https://api.example.com/orders"
```

## Spec

### `spec.defaults`

`defaults` is a partial `Monitor.spec` without `type` and `target`.

```yaml
defaults:
  enabled: true
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  successCriteria:
    http:
      acceptedStatusCodes: [200]
  alertmanagerUrl: "http://alertmanager.monitoring:9093/api/v1/alerts"
  alerting:
    notifyOn:
      down: true
      up: false
  tags:
    - api
```

### `spec.items`

Each item needs a `name` and a nested `spec`.

```yaml
items:
  - name: users-api
    spec:
      type: http
      target:
        http:
          url: "https://api.example.com/users"
  - name: orders-api
    spec:
      type: http
      schedule:
        intervalSeconds: 30
        timeoutSeconds: 10
      target:
        http:
          url: "https://api.example.com/orders"
```

## Status

The CRD schema reserves aggregate status fields:

```yaml
status:
  observedGeneration: 1
  validCount: 2
  invalidCount: 0
  itemStatuses:
    - name: users-api
      ready: true
    - name: orders-api
      ready: true
```

## Notes

- `item.name` must be unique within the set.
- `defaults` is merged conceptually into each item before validation.
- The current controller validates `MonitorSet` objects, but explicit `Monitor` resources are still the safest production path while batch materialization evolves.
