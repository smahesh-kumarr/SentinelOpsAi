# Runbook: Kubernetes Container OutOfMemory (OOM) & Memory Exhaustion

## Incident Symptoms
- Prometheus metric `container_memory_working_set_bytes` exceeds 90% of configured container memory limit.
- Container termination reason reported as `OOMKilled` (Exit Code 137).
- Application logs contain fatal memory allocation errors:
  - `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`
  - `java.lang.OutOfMemoryError: Java heap space`
  - `MemoryError` or process killed by Linux kernel OOM-killer.

## Root Cause Diagnostics
1. **Application Memory Leak**: Unbounded collections, unclosed event listeners, unreleased cache objects, or circular references steadily consuming memory until hitting container limits.
2. **Under-provisioned Memory Limits**: Workload memory limits configured too tightly (e.g. deliberate 200Mi limit) unable to handle baseline traffic or burst allocations.
3. **Buffer / Stream Exhaustion**: Loading large payloads or files entirely into memory without streaming.

## Recommended Remediation Steps
1. **Immediate Relief (Low Risk - Autonomous)**:
   - Perform a rolling restart of the deployment to clear accumulated heap memory and restore service availability.
   - Command: `kubectl rollout restart deployment {service} -n sentinelopsai`
2. **Horizontal Scaling (Low Risk - Autonomous)**:
   - Scale out deployment replicas to distribute traffic load across multiple pods and reduce memory pressure per pod.
   - Command: `kubectl scale deployment {service} --replicas=3 -n sentinelopsai`
3. **Long-Term Remedy (Medium Risk - Approval Required)**:
   - Increase container memory request and limit in deployment specification if workload baseline requires higher headroom (e.g. increase from 200Mi to 512Mi).
   - Command: `kubectl set resources deployment {service} --limits=memory=512Mi --requests=memory=256Mi -n sentinelopsai`
   - Profiling heap snapshots to identify leaking object references in source code.
