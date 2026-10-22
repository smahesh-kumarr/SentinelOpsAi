# Runbook: High CPU Saturation & Latency Degradation

## Incident Symptoms
- Prometheus metric `container_cpu_usage_seconds_total` rate exceeds 90% threshold.
- Elevated request latency (p95/p99 latency spikes above 1000ms).
- CPU throttling metrics (`container_cpu_cfs_throttled_seconds_total`) climbing sharply.
- HTTP 504 Gateway Timeout or slow event loop warnings.

## Root Cause Diagnostics
1. **Compute-Intensive Task or Inefficient Algorithm**: Synchronous CPU-bound blocking operations (e.g. heavy crypto, recursive sorting, unindexed DB aggregation) blocking the Node.js event loop.
2. **Surge in Incoming Traffic**: High concurrent requests exceeding single-pod capacity.
3. **Denial of Service (DoS) Pattern**: Malicious or unthrottled client flooding endpoints.

## Recommended Remediation Steps
1. **Horizontal Scaling (Low Risk - Autonomous)**:
   - Scale out deployment replicas to distribute request load immediately.
   - Command: `kubectl scale deployment {service} --replicas=3 -n sentinelopsai`
2. **Increase CPU Resource Limit (Medium Risk - Approval Required)**:
   - Adjust CPU limits to give container more compute bandwidth.
   - Command: `kubectl set resources deployment {service} --limits=cpu=500m -n sentinelopsai`
3. **Rolling Restart (Low Risk - Safe)**:
   - Restart deployment if worker process is stuck in an infinite loop.
   - Command: `kubectl rollout restart deployment {service} -n sentinelopsai`
