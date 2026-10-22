# Runbook: Kubernetes Pod CrashLoopBackOff & Startup Failures

## Incident Symptoms
- Kubernetes pod status indicates `CrashLoopBackOff`.
- Restart count is rapidly increasing (> 2-3 restarts in a short time frame).
- Pod fails liveness or readiness probes repeatedly.
- Container exits immediately with Exit Code 1, 2, or 127.

## Root Cause Diagnostics
1. **Bad Configuration or Missing Environment Variables**: Missing required secrets (e.g. `DATABASE_URL`, `JWT_SECRET`) causing immediate crash during bootstrap.
2. **Failed Database Connectivity**: Inability to reach backend datastores (MongoDB, Redis, Postgres) during application initialization.
3. **Faulty Image or Buggy Release Deployment**: Recent rollout of a new image tag containing application syntax errors, unhandled promise rejections, or missing binary dependencies.

## Recommended Remediation Steps
1. **Rollback Deployment (Medium Risk - Approval Required)**:
   - If the crash occurred following a recent deployment, revert to the previous known good revision immediately.
   - Command: `kubectl rollout undo deployment {service} -n sentinelopsai`
2. **Inspect Container Logs (Low Risk - Safe)**:
   - Examine stderr logs from previous terminated container instance:
   - Command: `kubectl logs {service} -n sentinelopsai --previous`
3. **Restart Deployment (Low Risk - Autonomous)**:
   - If crash was due to transient external dependency timeout, attempt a clean rolling restart:
   - Command: `kubectl rollout restart deployment {service} -n sentinelopsai`
