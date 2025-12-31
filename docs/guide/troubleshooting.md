# Troubleshooting

Common issues and how to resolve them.

## Installation Issues

### CRDs Not Found

**Symptom**: `error: the server doesn't have a resource type "monitors"`

**Solution**: Apply CRDs first:

```bash
kubectl apply -f https://raw.githubusercontent.com/briansunter/yuptime/master/manifests/crds.yaml
```

### Pod Not Starting

**Symptom**: Pod stuck in `Pending` or `CrashLoopBackOff`

**Diagnosis**:

```bash
# Check pod status
kubectl get pods -n yuptime -o wide

# Check events
kubectl describe pod -n yuptime -l app=yuptime-api

# Check logs
kubectl logs -n yuptime -l app=yuptime-api --previous
```

**Common causes**:
- Insufficient resources (check requests/limits)
- Missing RBAC permissions
- Image pull errors

### RBAC Errors

**Symptom**: Logs show `forbidden` errors

**Solution**: Verify RBAC is applied:

```bash
# Check service account
kubectl get sa yuptime -n yuptime

# Check role bindings
kubectl get clusterrolebinding | grep yuptime

# Test permissions
kubectl auth can-i get monitors --as=system:serviceaccount:yuptime:yuptime -n yuptime
```

## Monitor Issues

### Monitor Not Running

**Symptom**: Monitor shows no recent checks

**Diagnosis**:

```bash
# Check monitor status
kubectl get monitor my-monitor -n yuptime -o yaml

# Check for jobs
kubectl get jobs -n yuptime -l yuptime.io/monitor=my-monitor

# Check Yuptime logs
kubectl logs -n yuptime -l app=yuptime-api | grep my-monitor
```

**Common causes**:
- Invalid monitor spec
- Scheduler not running
- RBAC issues for checker service account

### Checker Jobs Failing

**Symptom**: Jobs complete but status shows errors

**Diagnosis**:

```bash
# Find checker job
kubectl get jobs -n yuptime -l yuptime.io/monitor=my-monitor

# Check job logs
kubectl logs -n yuptime job/monitor-check-my-monitor-<timestamp>

# Check pod events
kubectl describe pod -n yuptime -l job-name=monitor-check-my-monitor-<timestamp>
```

**Common causes**:
- Network connectivity issues
- Target unreachable
- TLS/certificate errors
- Authentication failures

### Status Not Updating

**Symptom**: Monitor runs but status doesn't change

**Diagnosis**:

```bash
# Check checker RBAC
kubectl auth can-i patch monitors/status \
  --as=system:serviceaccount:yuptime:yuptime-checker \
  -n yuptime

# Check for errors in checker logs
kubectl logs -n yuptime job/monitor-check-<name>-<timestamp>
```

**Solution**: Ensure checker service account has status patch permissions:

```yaml
rules:
  - apiGroups: ["monitoring.yuptime.io"]
    resources: ["monitors/status"]
    verbs: ["patch", "update"]
```

## Connectivity Issues

### HTTP Monitors Timeout

**Diagnosis**:

```bash
# Test from within the cluster
kubectl run test-curl --rm -it --image=curlimages/curl --restart=Never -- \
  curl -v https://api.example.com/health
```

**Common causes**:
- Network policies blocking egress
- DNS resolution failures
- Firewall rules

### DNS Resolution Failures

**Symptom**: "could not resolve host"

**Diagnosis**:

```bash
# Test DNS resolution
kubectl run test-dns --rm -it --image=busybox --restart=Never -- \
  nslookup api.example.com
```

**Solution**: Specify custom DNS resolvers:

```yaml
target:
  http:
    url: "https://api.example.com"
    dnsResolvers:
      - "8.8.8.8"
      - "1.1.1.1"
```

### TLS Errors

**Symptom**: "certificate verify failed" or "unknown certificate"

**Solutions**:

1. Skip verification (not recommended for production):

```yaml
target:
  http:
    url: "https://internal.example.com"
    tls:
      skipVerify: true
```

2. Specify SNI for multi-host servers:

```yaml
target:
  http:
    url: "https://192.168.1.100"
    tls:
      sni: "api.example.com"
```

## Alerting Issues

### Alerts Not Sending

**Diagnosis**:

```bash
# Check Alertmanager is reachable
kubectl run test-curl --rm -it --image=curlimages/curl --restart=Never -- \
  curl http://alertmanager.monitoring:9093/-/ready

# Check Yuptime logs for alert errors
kubectl logs -n yuptime -l app=yuptime-api | grep -i alert
```

**Common causes**:
- Wrong Alertmanager URL
- Network policy blocking
- Alertmanager not running

### Duplicate Alerts

**Cause**: Multiple monitors or Alertmanager misconfiguration

**Solution**: Check for duplicate monitors:

```bash
kubectl get monitors -n yuptime -o name | sort | uniq -d
```

## Performance Issues

### High Resource Usage

**Diagnosis**:

```bash
# Check resource usage
kubectl top pod -n yuptime

# Check number of monitors
kubectl get monitors -A --no-headers | wc -l
```

**Solutions**:
- Increase check intervals
- Set resource limits
- Reduce concurrent checks in YuptimeSettings

### Slow Checks

**Diagnosis**: Check latency in monitor status

```bash
kubectl get monitors -n yuptime -o custom-columns=\
NAME:.metadata.name,\
LATENCY:.status.lastCheck.latencyMs
```

**Solutions**:
- Increase timeout
- Check target performance
- Use closer DNS resolvers

## Common Errors

### "no matches for kind 'Monitor'"

CRDs not installed. Apply them:

```bash
kubectl apply -f manifests/crds.yaml
```

### "forbidden: User ... cannot get resource"

RBAC issue. Check role bindings:

```bash
kubectl get clusterrolebinding -o wide | grep yuptime
```

### "connection refused"

Target not accessible. Test from cluster:

```bash
kubectl run test --rm -it --image=busybox --restart=Never -- \
  nc -zv <host> <port>
```

### "certificate signed by unknown authority"

Self-signed or internal CA. Options:
1. Add CA to trust store
2. Use `tls.skipVerify: true` (development only)

## Getting Help

1. Check logs: `kubectl logs -n yuptime -l app=yuptime-api -f`
2. Check events: `kubectl get events -n yuptime --sort-by='.lastTimestamp'`
3. [GitHub Issues](https://github.com/briansunter/yuptime/issues)
4. [GitHub Discussions](https://github.com/briansunter/yuptime/discussions)
