# Push Monitor

Receives status updates via HTTP webhooks instead of actively polling. Ideal for cron jobs, batch processes, and custom integrations.

## Basic Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: backup-job
  namespace: yuptime
spec:
  type: push
  schedule:
    intervalSeconds: 300
    timeoutSeconds: 10
  target:
    push:
      tokenSecretRef:
        name: push-token
        key: token
      expireSeconds: 300
      gracePeriodSeconds: 60
```

## Target Configuration

```yaml
target:
  push:
    tokenSecretRef:
      name: push-token              # Secret containing push token
      key: token                     # Key in secret
    expireSeconds: 300               # Time until status expires
    gracePeriodSeconds: 60           # Grace period after expiry
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `tokenSecretRef.name` | Yes | - | Secret name |
| `tokenSecretRef.key` | Yes | - | Key for token |
| `expireSeconds` | No | `300` | Status expiration time |
| `gracePeriodSeconds` | No | `60` | Grace period before unhealthy |

## Sending Pushes

Send a push to report status:

```bash
curl -X POST "https://yuptime.example.com/api/push/yuptime/backup-job" \
  -H "Authorization: Bearer my-secure-token" \
  -H "Content-Type: application/json" \
  -d '{"status": "up", "message": "Backup completed"}'
```

## Examples

### Cron Job Monitoring

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: nightly-backup
  namespace: yuptime
spec:
  type: push
  schedule:
    intervalSeconds: 86400
    timeoutSeconds: 10
  target:
    push:
      tokenSecretRef:
        name: backup-push-token
        key: token
      expireSeconds: 90000    # 25 hours
      gracePeriodSeconds: 3600
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: warning
```

### Heartbeat from External System

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: payment-processor
  namespace: yuptime
spec:
  type: push
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    push:
      tokenSecretRef:
        name: payment-push-token
        key: token
      expireSeconds: 120
      gracePeriodSeconds: 30
```

## Token Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: push-token
  namespace: yuptime
type: Opaque
stringData:
  token: "your-secure-random-token"
```

## Use Cases

- Cron job completion
- Backup job status
- Batch process health
- External system integration
- Serverless function health
