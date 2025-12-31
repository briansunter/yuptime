# KubeKuma Alerting System - Quick Start Guide

## Overview

KubeKuma's alerting system automatically detects state changes in monitors and routes alerts to notification providers based on flexible policy rules.

## Key Concepts

### 1. Incident
An incident represents a period where a monitor is down or unhealthy.
- Created automatically when monitor transitions from UP to DOWN
- Closed automatically when monitor recovers to UP
- Can be suppressed via Silence or MaintenanceWindow CRDs
- Tracks acknowledgment and resolution

### 2. NotificationPolicy
Rules that determine which monitors send alerts to which channels.
- Match monitors by labels using selectors
- Define triggers (onDown, onUp, onFlapping)
- Configure deduplication and rate limiting
- Format alert messages with templates
- Route to multiple providers

### 3. NotificationProvider
Integration with external notification services.
- 8 built-in providers: Slack, Discord, Telegram, SMTP, Webhook, Gotify, Pushover, Apprise
- Store credentials in Kubernetes secrets
- Automatically tested on reconciliation
- Support custom headers, authentication, templates

## Example Setup

### Step 1: Create Kubernetes Secrets for Credentials

```bash
kubectl create secret generic slack-webhook \
  --from-literal=url='https://hooks.slack.com/services/YOUR/WEBHOOK/URL' \
  -n monitoring

kubectl create secret generic telegram-bot \
  --from-literal=token='YOUR_BOT_TOKEN' \
  --from-literal=chatId='YOUR_CHAT_ID' \
  -n monitoring
```

### Step 2: Create NotificationProviders

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: NotificationProvider
metadata:
  name: slack-alerts
  namespace: monitoring
spec:
  type: slack
  enabled: true
  config:
    slack:
      webhookUrlSecretRef:
        name: slack-webhook
        key: url
        namespace: monitoring
---
apiVersion: monitoring.kubekuma.io/v1
kind: NotificationProvider
metadata:
  name: telegram-alerts
  namespace: monitoring
spec:
  type: telegram
  enabled: true
  config:
    telegram:
      botTokenSecretRef:
        name: telegram-bot
        key: token
        namespace: monitoring
      chatIdSecretRef:
        name: telegram-bot
        key: chatId
        namespace: monitoring
```

After creating, the system automatically tests connectivity. Check status:

```bash
kubectl describe notificationprovider slack-alerts -n monitoring
```

You should see in status:
- `conditions.Valid = True` if provider is valid
- `isHealthy = true` if connectivity test passed
- `lastTestAt` timestamp

### Step 3: Label Your Monitors

Add labels to monitors for policy matching:

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: Monitor
metadata:
  name: api-server
  namespace: monitoring
  labels:
    environment: production
    tier: critical
    team: platform
spec:
  type: http
  interval: 60
  target:
    http:
      url: https://api.example.com/health
```

### Step 4: Create NotificationPolicies

```yaml
# Policy 1: All production-critical monitors → Slack
apiVersion: monitoring.kubekuma.io/v1
kind: NotificationPolicy
metadata:
  name: production-critical
  namespace: monitoring
spec:
  priority: 100
  match:
    environment: production
    tier: critical
  triggers:
    onDown: true
    onUp: true
    onFlapping: false
  routing:
    providers:
      - ref:
          name: slack-alerts
    dedupe:
      windowMinutes: 30
    rateLimit:
      minMinutesBetweenAlerts: 5
  formatting:
    titleTemplate: "🚨 [CRITICAL] {monitorName} is {state}"
    bodyTemplate: |
      State: {state}
      Reason: {reason}
      Message: {message}
      Latency: {latency}ms

---

# Policy 2: All production monitors → Telegram (lower priority)
apiVersion: monitoring.kubekuma.io/v1
kind: NotificationPolicy
metadata:
  name: production-all
  namespace: monitoring
spec:
  priority: 50
  match:
    environment: production
  triggers:
    onDown: true
    onUp: false
    onFlapping: true
  routing:
    providers:
      - ref:
          name: telegram-alerts
    dedupe:
      windowMinutes: 15
    rateLimit:
      minMinutesBetweenAlerts: 1

---

# Policy 3: Development monitors → Webhook (for automation)
apiVersion: monitoring.kubekuma.io/v1
kind: NotificationPolicy
metadata:
  name: development-webhook
  namespace: monitoring
spec:
  priority: 10
  match:
    environment: development
  triggers:
    onDown: true
  routing:
    providers:
      - ref:
          name: webhook-ci
```

## How It Works

### When a Monitor Check Runs

```
1. Scheduler executes monitor check
   ↓
2. Check result stored as Heartbeat
   ↓
3. System detects state change:
   Previous: UP, Current: DOWN → AlertEvent created
   ↓
4. Find matching policies for this monitor
   - api-server matches: production-critical, production-all
   ↓
5. For each matching policy:
   - Check if trigger matches (onDown=true ✓)
   - Check deduplication (first DOWN alert → not deduped ✓)
   - Check rate limiting (no recent alerts → not rate limited ✓)
   - Format message with template
   ↓
6. Queue notifications:
   - production-critical → slack-alerts
   - production-all → telegram-alerts
   ↓
7. Background worker sends notifications:
   - Fetches provider config from cluster
   - Calls provider's send function
   - Tracks delivery status
   - Retries on failure
```

### Example Alert Messages

**Slack (via production-critical policy):**
```
🚨 [CRITICAL] api-server is down
────────────────────────────────
State: down
Reason: CONNECTION_REFUSED
Message: Connection refused on 10.0.1.5:443
Latency: 100ms

Sent at 2025-12-15T10:00:00Z
```

**Telegram (via production-all policy):**
```
State: down
Reason: CONNECTION_REFUSED
Message: Connection refused on 10.0.1.5:443
Latency: 100ms
```

## Deduplication & Rate Limiting

### Deduplication

Prevents sending duplicate alerts for the same event:

```yaml
routing:
  dedupe:
    key: "{monitorName}:{policyName}"  # Custom dedup key (optional)
    windowMinutes: 30                  # Default: 10
```

Within 30 minutes, if api-server goes DOWN → ALERT (sent), then:
- Same policy tries to send again → DEDUPED (logged but not sent)
- After 30 minutes, if still DOWN → ALERT (sent again)

### Rate Limiting

Prevents alert storms for the same monitor+policy:

```yaml
routing:
  rateLimit:
    minMinutesBetweenAlerts: 5  # Max 1 alert every 5 minutes
```

If api-server flaps UP↔DOWN repeatedly:
- First DOWN → ALERT (sent)
- Second DOWN (2 min later) → RATE LIMITED (queued but deferred)
- After 5 min total → ALERT (sent if still down)

## Suppression (Preview)

Alerts can be suppressed with:

### Silence (coming Phase 4)
Time-bounded suppression with optional schedule:

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: Silence
metadata:
  name: maintenance-tuesday
spec:
  startsAt: "2025-12-15T22:00:00Z"
  endsAt: "2025-12-15T23:00:00Z"
  matchers:
    - name: environment
      value: staging
  comment: "Weekly database maintenance"
```

### MaintenanceWindow (coming Phase 4)
Recurring scheduled downtime with RRULE:

```yaml
apiVersion: monitoring.kubekuma.io/v1
kind: MaintenanceWindow
metadata:
  name: weekly-patching
spec:
  description: "Weekly patching window"
  matchers:
    - name: tier
      value: non-critical
  schedule:
    recurrence: "RRULE:FREQ=WEEKLY;BYDAY=SA;BYHOUR=02"
    duration: 2h
```

## Observability

### Check Notification Status

```bash
# See all pending/sent notifications
kubectl get notificationdeliveries -n monitoring

# Check a specific notification
kubectl describe notificationdelivery <id> -n monitoring
```

Fields:
- `status`: pending, sent, failed, deduped
- `attempts`: number of delivery attempts
- `lastAttemptAt`: when last attempt occurred
- `lastError`: error message from last failure
- `sentAt`: when successfully delivered

### View Incidents

```bash
# See all incidents
kubectl get incidents -n monitoring

# Check active incidents
kubectl get incidents -n monitoring --field-selector=status.endedAt=""

# View incident details
kubectl describe incident <id> -n monitoring
```

Incident fields:
- `monitorId`: which monitor
- `state`: "up" or "down"
- `startedAt`: when incident began
- `endedAt`: when incident was resolved (null if ongoing)
- `duration`: incident length in seconds
- `suppressed`: is this incident muted?

### Monitor Logs

```bash
# Follow KubeKuma logs
kubectl logs -f deployment/kubekuma -n monitoring

# Filter for alerting messages
kubectl logs deployment/kubekuma -n monitoring | grep -i alert
```

Log messages include:
- Policy matches: "Policies matched"
- Alert processing: "Alerts queued for delivery"
- Delivery status: "Notification delivered" or "Notification delivery failed"
- Provider tests: "Provider connectivity test passed"

## Provider-Specific Configuration

### Slack

```yaml
config:
  slack:
    webhookUrlSecretRef:
      name: slack-webhook
      key: url
```

Create webhook: Workspace Settings → Manage Apps → Incoming Webhooks

### Discord

```yaml
config:
  discord:
    webhookUrlSecretRef:
      name: discord-webhook
      key: url
```

Create webhook: Server Settings → Integrations → Webhooks

### Telegram

```yaml
config:
  telegram:
    botTokenSecretRef:
      name: telegram-creds
      key: token
    chatIdSecretRef:
      name: telegram-creds
      key: chatId
```

Get credentials: BotFather → /newbot, then /getMe for token

### Email (SMTP)

```yaml
config:
  smtp:
    host: smtp.example.com
    port: 587
    useTls: true
    from: kubekuma@example.com
    to:
      - team@example.com
    usernameSecretRef:
      name: smtp-creds
      key: username
    passwordSecretRef:
      name: smtp-creds
      key: password
```

### Webhook

```yaml
config:
  webhook:
    urlSecretRef:
      name: webhook-url
      key: url
    method: POST
    headers:
      - name: X-Custom-Header
        value: custom-value
      - name: Authorization
        valueFromSecretRef:
          name: webhook-auth
          key: token
```

POST body:
```json
{
  "title": "Alert title",
  "body": "Alert body",
  "timestamp": "2025-12-15T10:00:00Z"
}
```

### Gotify

```yaml
config:
  gotify:
    baseUrlSecretRef:
      name: gotify-creds
      key: baseUrl
    tokenSecretRef:
      name: gotify-creds
      key: token
```

### Pushover

```yaml
config:
  pushover:
    userKeySecretRef:
      name: pushover-creds
      key: userKey
    apiTokenSecretRef:
      name: pushover-creds
      key: apiToken
    deviceSecretRef:
      name: pushover-creds
      key: device  # Optional
```

### Apprise

```yaml
config:
  apprise:
    urlSecretRef:
      name: apprise-url
      key: url
```

Apprise URL examples: `slack://token/channel`, `discord://webhook`, `telegram://token/chatid`

## Best Practices

1. **Label Your Monitors**
   - Use consistent label schemas
   - Include: environment, tier, team, service

2. **Organize Policies by Priority**
   - Higher priority policies evaluated first
   - Use priority field for ordering

3. **Use Deduplication**
   - Prevents alert fatigue
   - Set appropriate window based on check interval

4. **Apply Rate Limiting**
   - Especially for flapping monitors
   - Prevents notification storm

5. **Test Providers**
   - System auto-tests on creation
   - Check `isHealthy` status before relying on provider

6. **Use Custom Templates**
   - Include relevant context in messages
   - Use title for quick scanning

7. **Suppress When Needed**
   - Use Silence for temporary suppression
   - Use MaintenanceWindow for planned downtime

8. **Monitor Notification Delivery**
   - Regularly check delivery status
   - Investigate failed notifications
   - Add retry logic for critical alerts

## Troubleshooting

### Provider Test Failed

```bash
kubectl describe notificationprovider slack-alerts -n monitoring
# Check: lastError field
```

Common issues:
- Invalid webhook URL in secret
- Network connectivity issue
- Provider service down

Fix: Update secret and recreate provider:
```bash
kubectl delete notificationprovider slack-alerts -n monitoring
# Update secret, then reapply YAML
kubectl apply -f notification-provider.yaml
```

### Alerts Not Being Sent

1. Check policy is valid:
```bash
kubectl describe notificationpolicy production-critical -n monitoring
```

2. Check provider is healthy:
```bash
kubectl describe notificationprovider slack-alerts -n monitoring
```

3. Check notification delivery status:
```bash
kubectl get notificationdeliveries -n monitoring
```

4. Check logs for matching:
```bash
kubectl logs deployment/kubekuma -n monitoring | grep "Policies matched"
```

### Too Many Alerts

1. Increase dedup window:
```yaml
routing:
  dedupe:
    windowMinutes: 60  # Increase from 30
```

2. Add rate limiting:
```yaml
routing:
  rateLimit:
    minMinutesBetweenAlerts: 10  # 1 alert per 10 minutes max
```

3. Reduce monitor check frequency:
```yaml
spec:
  interval: 300  # Check every 5 minutes instead of 1 minute
```

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [PHASE_3_SUMMARY.md](./PHASE_3_SUMMARY.md) - Technical details
- [CRD Specification](./CRDS.md) - Full API reference
