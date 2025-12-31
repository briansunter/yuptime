# TCP Monitor

The TCP monitor checks TCP port connectivity with optional send/expect patterns.

## Basic Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: postgres-port
  namespace: yuptime
spec:
  type: tcp
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    tcp:
      host: "postgres.database.svc.cluster.local"
      port: 5432
```

## Target Configuration

```yaml
target:
  tcp:
    host: "db.example.com"     # Required: hostname or IP
    port: 5432                  # Required: port number
    send: "PING\n"              # Optional: data to send
    expect: "PONG"              # Optional: expected response
    tls:
      enabled: false            # Enable TLS
      skipVerify: false         # Skip certificate verification
      sni: "db.example.com"     # Server Name Indication
```

## Examples

### Database Port Check

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: mysql-port
  namespace: yuptime
spec:
  type: tcp
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    tcp:
      host: "mysql.database.svc.cluster.local"
      port: 3306
```

### SMTP with Send/Expect

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: smtp-server
  namespace: yuptime
spec:
  type: tcp
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    tcp:
      host: "mail.example.com"
      port: 25
      send: "EHLO test\r\n"
      expect: "250"
```

### TLS Connection

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: secure-service
  namespace: yuptime
spec:
  type: tcp
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    tcp:
      host: "secure.example.com"
      port: 443
      tls:
        enabled: true
        sni: "secure.example.com"
```
