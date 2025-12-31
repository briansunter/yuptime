# Push Monitor

The push monitor receives status updates via HTTP webhooks instead of actively polling.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: push-check
  namespace: yuptime
spec:
  type: push
  schedule:
    intervalSeconds: 300
    timeoutSeconds: 10
  target:
    push:
      tokenSecretRef:
        name: push-token-secret
        key: token
      expireSeconds: 300
      gracePeriodSeconds: 60
```

## Target Configuration

```yaml
target:
  push:
    tokenSecretRef:
      name: push-token-secret          # Secret containing push token
      key: token                        # Key in secret for token
    expireSeconds: 300                  # Time until status expires
    gracePeriodSeconds: 60              # Grace period after expiry
```

## Push Token Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: push-token-secret
  namespace: yuptime
type: Opaque
stringData:
  token: "my-secure-push-token"
```

## Sending Pushes

Send a push to report status:

```bash
curl -X POST "https://yuptime.example.com/api/push/yuptime/push-check" \
  -H "Authorization: Bearer my-secure-push-token" \
  -H "Content-Type: application/json" \
  -d '{"status": "up", "message": "Backup completed"}'
```

## Use Cases

- Cron job completion monitoring
- Backup job status reporting
- Batch process health checks
- External system integration
