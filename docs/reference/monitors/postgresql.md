# PostgreSQL Monitor

The PostgreSQL monitor checks database connectivity by executing a health query.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: postgresql-check
  namespace: yuptime
spec:
  type: postgresql
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    postgresql:
      host: "postgres.default.svc.cluster.local"
      port: 5432
      database: "myapp"
      credentialsSecretRef:
        name: postgres-credentials
        usernameKey: username
        passwordKey: password
```

## Target Configuration

```yaml
target:
  postgresql:
    host: "postgres.example.com"       # PostgreSQL server host
    port: 5432                          # PostgreSQL port (default: 5432)
    database: "postgres"                # Database name (default: "postgres")
    credentialsSecretRef:
      name: postgres-credentials        # Secret containing credentials
      usernameKey: username             # Key for username (default: "username")
      passwordKey: password             # Key for password (default: "password")
    healthQuery: "SELECT 1"             # Query to execute (default: "SELECT 1")
    sslMode: "prefer"                   # SSL mode (default: "prefer")
```

## SSL Modes

| Mode | Description |
|------|-------------|
| `disable` | No SSL |
| `prefer` | Try SSL, fall back to non-SSL |
| `require` | Require SSL |
| `verify-ca` | Require SSL with CA verification |
| `verify-full` | Require SSL with full verification |

## Credentials Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: postgres-credentials
  namespace: yuptime
type: Opaque
stringData:
  username: myuser
  password: mypassword
```
