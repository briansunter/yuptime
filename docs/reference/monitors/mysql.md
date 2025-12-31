# MySQL Monitor

The MySQL monitor checks database connectivity by executing a health query.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: mysql-check
  namespace: yuptime
spec:
  type: mysql
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    mysql:
      host: "mysql.default.svc.cluster.local"
      port: 3306
      database: "myapp"
      credentialsSecretRef:
        name: mysql-credentials
        usernameKey: username
        passwordKey: password
```

## Target Configuration

```yaml
target:
  mysql:
    host: "mysql.example.com"          # MySQL server host
    port: 3306                          # MySQL port (default: 3306)
    database: "myapp"                   # Database name (optional)
    credentialsSecretRef:
      name: mysql-credentials           # Secret containing credentials
      usernameKey: username             # Key for username (default: "username")
      passwordKey: password             # Key for password (default: "password")
    healthQuery: "SELECT 1"             # Query to execute (default: "SELECT 1")
    tls:
      enabled: false                    # Enable TLS (default: false)
      verify: true                      # Verify TLS certificates (default: true)
```

## Credentials Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mysql-credentials
  namespace: yuptime
type: Opaque
stringData:
  username: myuser
  password: mypassword
```
