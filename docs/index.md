---
layout: home

hero:
  name: Yuptime
  text: Kubernetes-native Monitoring
  tagline: All configuration is CRDs. GitOps-native. Database-free.
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
    details: All configuration lives in Git as YAML manifests. Works seamlessly with Flux, Argo CD, and any GitOps workflow.
  - icon: 📦
    title: Database-Free
    details: No databases to manage. State lives in CRD status subresources — the Kubernetes API is your storage layer.
  - icon: 🔒
    title: Isolated Execution
    details: Each health check runs in its own Kubernetes Job pod for security, resource isolation, and reliability.
  - icon: 📊
    title: Prometheus Metrics
    details: Native Prometheus metrics export for Grafana dashboards. Monitor your monitors with the tools you already use.
  - icon: 🔔
    title: Alertmanager Integration
    details: Direct webhook integration with Prometheus Alertmanager. Route alerts to Slack, PagerDuty, email, and more.
  - icon: ⏰
    title: Smart Suppressions
    details: Maintenance windows with RRULE scheduling and ad-hoc silences. Never get paged during planned downtime.
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #3eaf7c 30%, #2d9363);
}
</style>

## Quick Start

Install Yuptime in under 5 minutes:

::: code-group

```bash [Timoni]
# Install with Timoni (recommended)
timoni apply yuptime oci://ghcr.io/briansunter/yuptime/timoni-module \
  --version latest \
  --namespace yuptime
```

```bash [Helm]
# Install with Helm
helm install yuptime oci://ghcr.io/briansunter/yuptime/charts/yuptime \
  --namespace yuptime \
  --create-namespace
```

```bash [kubectl]
# Apply CRDs first
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/crds.yaml

# Create namespace and deploy
kubectl create namespace yuptime
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/all.yaml -n yuptime
```

:::

Then create your first monitor:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: my-website
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 30
  target:
    http:
      url: "https://example.com"
      method: GET
  successCriteria:
    http:
      acceptedStatusCodes: [200]
```

```bash
kubectl apply -f monitor.yaml
```

[Read the full guide →](/guide/getting-started)

## Monitor Types

Yuptime supports **14 monitor types** for comprehensive infrastructure monitoring:

| Type | Description |
|------|-------------|
| [HTTP](/reference/monitors/http) | HTTP/HTTPS endpoints with authentication, headers, and response validation |
| [TCP](/reference/monitors/tcp) | TCP port connectivity with optional send/expect patterns |
| [DNS](/reference/monitors/dns) | DNS record queries (A, AAAA, CNAME, TXT, MX, SRV) |
| [Ping](/reference/monitors/ping) | ICMP ping checks with packet count |
| [WebSocket](/reference/monitors/websocket) | WebSocket connection testing |
| [gRPC](/reference/monitors/grpc) | gRPC health checks using standard health protocol |
| [MySQL](/reference/monitors/mysql) | MySQL database connectivity and custom queries |
| [PostgreSQL](/reference/monitors/postgresql) | PostgreSQL database health with SSL support |
| [Redis](/reference/monitors/redis) | Redis PING command with authentication |
| [Kubernetes](/reference/monitors/kubernetes) | Deployment, StatefulSet, DaemonSet, Pod health |
| [Push](/reference/monitors/push) | Push-based monitoring for custom applications |
| [Steam](/reference/monitors/steam) | Steam game server monitoring |

## Why Yuptime?

**Traditional monitoring tools** require managing databases, complex configurations, and often break GitOps workflows by storing state outside of Git.

**Yuptime is different**:

- **Everything is a CRD** — version-controlled, auditable, and reproducible
- **No database to manage** — the Kubernetes API is your storage
- **Each check runs in isolation** — no shared state, no cascading failures
- **Works with your existing tools** — Prometheus, Alertmanager, Grafana

```
┌─────────────────────────────────────────────────────────────────┐
│                         Yuptime Pod                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Metrics   │  │ Controller  │  │      Job Manager        │  │
│  │   Server    │  │  (Watches   │  │  (Creates K8s Jobs for  │  │
│  │ (Port 3000) │  │    CRDs)    │  │     each check)         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Checker Job Pods (Isolated)                   │
├─────────────────────────────────────────────────────────────────┤
│  Job 1: HTTP Check    →  Updates Monitor CRD status (no DB)     │
│  Job 2: TCP Check     →  Updates Monitor CRD status (no DB)     │
└─────────────────────────────────────────────────────────────────┘
```

[Learn more about the architecture →](/guide/architecture)
