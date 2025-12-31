# MySQL Monitor

Checks MySQL/MariaDB connectivity by executing a health query.

## Basic Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: mysql-health
  namespace: yuptime
spec:
  type: mysql
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    mysql:
      host: "mysql.database.svc.cluster.local"
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
    host: "mysql.example.com"          # Required: server host
    port: 3306                          # Optional: port (default: 3306)
    database: "myapp"                   # Optional: database name
    credentialsSecretRef:
      name: mysql-credentials           # Required: secret name
      usernameKey: username             # Optional (default: "username")
      passwordKey: password             # Optional (default: "password")
    healthQuery: "SELECT 1"             # Optional: query (default: "SELECT 1")
    tls:
      enabled: false                    # Optional: enable TLS
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
  username: monitor_user
  password: secure_password
```

Create a read-only monitoring user:

```sql
CREATE USER 'monitor_user'@'%' IDENTIFIED BY 'password';
GRANT SELECT ON *.* TO 'monitor_user'@'%';
```

## Examples

### Basic Health Check

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: mysql-primary
  namespace: yuptime
spec:
  type: mysql
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    mysql:
      host: "mysql.database.svc.cluster.local"
      port: 3306
      credentialsSecretRef:
        name: mysql-credentials
```

### Amazon RDS

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: rds-mysql
  namespace: yuptime
spec:
  type: mysql
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 15
  target:
    mysql:
      host: "mydb.xxxx.us-east-1.rds.amazonaws.com"
      port: 3306
      database: "production"
      credentialsSecretRef:
        name: rds-credentials
      tls:
        enabled: true
```

### With Alerting

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: mysql-production
  namespace: yuptime
spec:
  type: mysql
  schedule:
    intervalSeconds: 30
    timeoutSeconds: 10
  target:
    mysql:
      host: "mysql.production.svc.cluster.local"
      credentialsSecretRef:
        name: mysql-credentials
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: critical
```

## Troubleshooting

**Connection refused**: MySQL not running or wrong host/port
**Access denied**: Wrong credentials or user doesn't exist
**Unknown database**: Database doesn't exist
