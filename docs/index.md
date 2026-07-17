---
layout: home

hero:
  name: Yuptime
  text: Kubernetes-native Monitoring
  tagline: CRD-driven, GitOps-friendly, and database-free.
  image:
    src: /logo.svg
    alt: Yuptime
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/briansunter/yuptime

features:
  - icon: 🎯
    title: GitOps-Native
    details: Store monitor configuration as Kubernetes resources in Git and let your normal deployment workflow apply it.
  - icon: 📦
    title: Database-Free
    details: Runtime state lives in CRD status subresources and metrics are exported directly for Prometheus.
  - icon: 🔒
    title: Isolated Execution
    details: Each check runs in its own Kubernetes Job pod instead of sharing process state.
  - icon: 📊
    title: Prometheus Metrics
    details: Scrape `/metrics` and build Grafana dashboards with your existing monitoring stack.
  - icon: 🔔
    title: Alertmanager Integration
    details: Send monitor state changes directly to Alertmanager with per-monitor routing control.
  - icon: ⏰
    title: Suppressions
    details: Use maintenance windows and silences to mute alerts during planned or ad-hoc work.
---

## Quick Start

Helm is the default installation route. For maintainers, the Timoni/CUE module under `timoni/yuptime/` is the authoritative packaging source; `k8s/`, `helm/yuptime/`, and `manifests/` are generated mirrors protected by semantic parity checks.

::: code-group

```bash [Helm (Recommended)]
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace
```

```bash [Timoni (Advanced)]
timoni apply yuptime oci://ghcr.io/briansunter/yuptime/timoni-module \
  --version latest \
  --namespace yuptime
```

```bash [kubectl]
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/k8s/crds.yaml
kubectl create namespace yuptime
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/all.yaml -n yuptime
```

:::

Then create a simple HTTP monitor:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: website-health
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://example.com"
  successCriteria:
    http:
      acceptedStatusCodes: [200]
```

## Monitor Types

Yuptime currently exposes 17 monitor enum values. `docker` is reserved but not implemented; the rest map to active checkers or protocol-specific validation flows.

| Type | Description |
|------|-------------|
| [HTTP](/reference/monitors/http) | HTTP/HTTPS endpoints |
| [TCP](/reference/monitors/tcp) | TCP connectivity and send/expect checks |
| [DNS](/reference/monitors/dns) | DNS lookups |
| [Ping](/reference/monitors/ping) | ICMP reachability |
| [WebSocket](/reference/monitors/websocket) | WebSocket connectivity |
| [gRPC](/reference/monitors/grpc) | gRPC health checks |
| [MySQL](/reference/monitors/mysql) | MySQL connectivity |
| [PostgreSQL](/reference/monitors/postgresql) | PostgreSQL connectivity |
| [Redis](/reference/monitors/redis) | Redis connectivity |
| [Kubernetes](/reference/monitors/kubernetes) | In-cluster resource health |
| [Push](/reference/monitors/push) | Push/heartbeat monitoring |
| [Steam](/reference/monitors/steam) | Steam game servers |
| `keyword` | HTTP body keyword matching |
| `jsonQuery` | JSONPath-based validation |
| `xmlQuery` | XPath-based validation |
| `htmlQuery` | CSS selector validation |
| `docker` | Reserved placeholder |

## Why Yuptime?

- Configuration is stored in Kubernetes resources, not a separate database.
- The controller only writes to status subresources.
- Each check runs in an isolated Job pod.
- Metrics, health, and readiness endpoints are exposed on port `3000`.

[Read the getting started guide →](/guide/getting-started)
