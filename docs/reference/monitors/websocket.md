# WebSocket Monitor

The WebSocket monitor tests WebSocket connections and optionally validates message exchange.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: websocket-check
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
```

## Target Configuration

```yaml
target:
  websocket:
    url: "wss://api.example.com/ws"    # WebSocket URL (ws:// or wss://)
    headers:                            # Optional custom headers
      - name: "Authorization"
        value: "Bearer token"
    send: '{"type": "ping"}'           # Optional message to send after connect
    expect: "pong"                      # Optional response pattern to match
```

## Success Criteria

```yaml
successCriteria:
  websocket:
    mustReceiveWithinSeconds: 5        # Require response within N seconds
```

## Notes

- Supports both `ws://` and `wss://` protocols
- If `send` is specified, waits for a response
- If `expect` is specified, validates response contains string or matches regex
