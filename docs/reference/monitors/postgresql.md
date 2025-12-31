# PostgreSQL Monitor

Checks PostgreSQL connectivity by executing a health query.

## Basic Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: postgres-health
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
    host: "postgres.example.com"        # Required: server host
    port: 5432                           # Optional: port (default: 5432)
    database: "postgres"                 # Optional: database (default: "postgres")
    credentialsSecretRef:
      name: postgres-credentials         # Required: secret name
      usernameKey: username              # Optional (default: "username")
      passwordKey: password              # Optional (default: "password")
    healthQuery: "SELECT 1"              # Optional: query (default: "SELECT 1")
    sslMode: "prefer"                    # Optional: SSL mode
```

## SSL Modes

| Mode | Description |
|------|-------------|
| `disable` | No SSL |
| `prefer` | Try SSL first (default) |
| `require` | Require SSL |
| `verify-ca` | Verify CA signature |
| `verify-full` | Verify CA and hostname |

## Credentials Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: postgres-credentials
  namespace: yuptime
type: Opaque
stringData:
  username: monitor_user
  password: secure_password
```

## Examples

### Basic Health Check

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: postgres-primary
  namespace: yuptime
spec:
  type: postgresql
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    postgresql:
      host: "postgres.database.svc.cluster.local"
      port: 5432
      credentialsSecretRef:
        name: postgres-credentials
```

### Amazon RDS

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: rds-postgres
  namespace: yuptime
spec:
  type: postgresql
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 15
  target:
    postgresql:
      host: "mydb.xxxx.us-east-1.rds.amazonaws.com"
      port: 5432
      database: "production"
      credentialsSecretRef:
        name: rds-credentials
      sslMode: "require"
```

### With Alerting

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: postgres-production
  namespace: yuptime
spec:
  type: postgresql
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    postgresql:
      host: "postgres.production.svc.cluster.local"
      credentialsSecretRef:
        name: postgres-credentials
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: critical
```

## Troubleshooting

**Connection refused**: PostgreSQL not running or wrong host/port
**Authentication failed**: Wrong credentials or pg_hba.conf issue
**Database does not exist**: Verify database name
