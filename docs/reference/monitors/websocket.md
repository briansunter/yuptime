# WebSocket Monitor

Tests WebSocket connections and optionally validates message exchange.

## Basic Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: realtime-ws
  namespace: yuptime
spec:
  type: websocket
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    websocket:
      url: "wss://api.example.com/ws"
```

## Target Configuration

```yaml
target:
  websocket:
    url: "wss://api.example.com/ws"    # Required: ws:// or wss://
    headers:                            # Optional: custom headers
      - name: "Authorization"
        value: "Bearer token"
    send: '{"type": "ping"}'           # Optional: message to send
    expect: "pong"                      # Optional: expected response
```

## Examples

### Connection Test Only

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: chat-websocket
  namespace: yuptime
spec:
  type: websocket
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    websocket:
      url: "wss://chat.example.com/socket"
```

### With Authentication

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: authenticated-ws
  namespace: yuptime
spec:
  type: websocket
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 15
  target:
    websocket:
      url: "wss://api.example.com/ws"
      headers:
        - name: "Authorization"
          value: "Bearer my-token"
```

### Ping/Pong Validation

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: ws-health
  namespace: yuptime
spec:
  type: websocket
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    websocket:
      url: "wss://api.example.com/ws"
      send: '{"type": "ping"}'
      expect: "pong"
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: warning
```

## Notes

- Supports both `ws://` and `wss://` protocols
- If `send` is specified, waits for a response
- If `expect` is specified, validates response contains the string
