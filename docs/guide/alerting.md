# Alerting

Yuptime integrates directly with Prometheus Alertmanager for alert routing and notification.

## How It Works

When a monitor changes state (healthy → unhealthy or vice versa), Yuptime sends an alert to the configured Alertmanager:

```
┌─────────────┐     ┌────────────┐     ┌──────────────┐
│   Monitor   │────→│  Yuptime   │────→│ Alertmanager │
│ (unhealthy) │     │ Controller │     │              │
└─────────────┘     └────────────┘     └──────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
                    ▼                         ▼                         ▼
              ┌─────────┐              ┌─────────┐              ┌─────────┐
              │  Slack  │              │PagerDuty│              │  Email  │
              └─────────┘              └─────────┘              └─────────┘
```

## Configuration

### Per-Monitor Alerting

Add the `alerting` section to any monitor:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: critical-api
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    http:
      url: "https://api.example.com/health"
      method: GET
  alerting:
    alertmanagerUrl: "http://alertmanager.monitoring:9093"
    labels:
      severity: critical
      team: platform
      service: api
```

### Alerting Fields

```yaml
alerting:
  alertmanagerUrl: "http://alertmanager:9093"  # Alertmanager endpoint
  labels:                                        # Labels attached to alerts
    severity: critical
    team: platform
    environment: production
```

## Alertmanager Integration

### Alert Format

Yuptime sends alerts in the standard Alertmanager format:

```json
[
  {
    "labels": {
      "alertname": "MonitorUnhealthy",
      "monitor": "critical-api",
      "namespace": "yuptime",
      "severity": "critical",
      "team": "platform"
    },
    "annotations": {
      "summary": "Monitor critical-api is unhealthy",
      "description": "HTTP check failed: connection timeout"
    },
    "startsAt": "2025-12-30T10:00:00Z",
    "generatorURL": "https://yuptime.example.com/monitors/critical-api"
  }
]
```

### Alertmanager Configuration

Configure Alertmanager to route Yuptime alerts:

```yaml
# alertmanager.yml
route:
  receiver: 'default'
  routes:
    # Critical alerts go to PagerDuty
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true

    # All alerts also go to Slack
    - match:
        alertname: MonitorUnhealthy
      receiver: 'slack'

receivers:
  - name: 'default'
    # Default receiver

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '<your-service-key>'

  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/...'
        channel: '#alerts'
        title: '{{ .CommonLabels.alertname }}'
        text: '{{ .CommonAnnotations.summary }}'
```

## Alert Labels

### Built-in Labels

Yuptime automatically adds these labels:

| Label | Description |
|-------|-------------|
| `alertname` | Always "MonitorUnhealthy" |
| `monitor` | Monitor name |
| `namespace` | Monitor namespace |
| `type` | Monitor type (http, tcp, etc.) |

### Custom Labels

Add custom labels in the alerting config:

```yaml
alerting:
  alertmanagerUrl: "http://alertmanager:9093"
  labels:
    severity: critical
    team: platform
    environment: production
    tier: frontend
```

### Label Best Practices

Use consistent labels for routing:

```yaml
# Critical production services
alerting:
  labels:
    severity: critical
    environment: production

# Non-critical staging
alerting:
  labels:
    severity: warning
    environment: staging

# Team-based routing
alerting:
  labels:
    team: backend
    oncall: true
```

## Suppressions

### MaintenanceWindow

Suppress alerts during scheduled maintenance:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: MaintenanceWindow
metadata:
  name: weekly-maintenance
  namespace: yuptime
spec:
  schedule: "RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=2"
  duration: "2h"
  selector:
    matchLabels:
      environment: production
```

### Silence

Suppress alerts during one-time events:

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Silence
metadata:
  name: deploy-silence
  namespace: yuptime
spec:
  startsAt: "2025-12-30T14:00:00Z"
  endsAt: "2025-12-30T14:30:00Z"
  matchers:
    - name: environment
      value: production
      isRegex: false
  comment: "Deployment window"
  createdBy: "ci-pipeline"
```

## Examples

### Critical API with PagerDuty

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: payment-api
  namespace: yuptime
  labels:
    tier: critical
spec:
  type: http
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    http:
      url: "https://payment.example.com/health"
      method: GET
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: critical
      team: payments
      pagerduty: "true"
```

### Non-Critical with Slack Only

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: blog-website
  namespace: yuptime
spec:
  type: http
  schedule:
    intervalSeconds: 300
    timeoutSeconds: 30
  target:
    http:
      url: "https://blog.example.com"
      method: GET
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: info
      team: marketing
```

### Database with Team Routing

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: postgres-primary
  namespace: yuptime
spec:
  type: postgresql
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    postgresql:
      host: "postgres.database.svc.cluster.local"
      port: 5432
      database: "production"
      user: "monitor"
      password:
        secretRef:
          name: db-credentials
          key: password
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: critical
      team: dba
      tier: database
```

## Troubleshooting

### Alerts Not Sending

1. Check Alertmanager is accessible:

```bash
kubectl port-forward svc/alertmanager 9093:9093 -n monitoring
curl http://localhost:9093/-/ready
```

2. Check Yuptime logs:

```bash
kubectl logs -n yuptime -l app=yuptime-api | grep alert
```

3. Verify alertmanagerUrl is correct:

```bash
kubectl get monitor my-monitor -o jsonpath='{.spec.alerting}'
```

### Duplicate Alerts

Check for duplicate monitors or misconfigurated Alertmanager grouping.

### Alerts Not Resolving

Ensure the monitor transitions back to healthy state. Check monitor status:

```bash
kubectl get monitor my-monitor -o jsonpath='{.status.state}'
```
