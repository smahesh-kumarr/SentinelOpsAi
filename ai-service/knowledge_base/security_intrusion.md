# Runbook: Runtime Security Intrusion & Unauthorized Container Access

## Incident Symptoms
- Falco eBPF security sensor triggers rule `Terminal shell in container`.
- Unexpected interactive shell process (`/bin/bash`, `/bin/sh`, `zsh`) spawned inside container.
- Suspicious outbound network connections or sensitive file access attempts (`/etc/shadow`, `/etc/passwd`, service account token `/var/run/secrets/kubernetes.io/serviceaccount`).
- Multiple failed authentication or SSH brute force patterns.

## Root Cause Diagnostics
1. **Remote Code Execution (RCE) Exploit**: Attacker leveraged application vulnerability (e.g. log4j, injection flaw, unauthenticated API) to execute commands in container.
2. **Compromised Pod Credentials**: Leaked service account token or pod exec breach.
3. **Unauthorized Manual SRE / Developer Exec**: Manual `kubectl exec` session initiated without proper change approval or audit ticket.

## Recommended Remediation Steps
1. **Quarantine / Isolate Compromised Pod (High Risk - Approval Required)**:
   - Apply strict zero-trust Kubernetes NetworkPolicy to cut off all ingress and egress network traffic while preserving pod filesystem state for forensic investigation.
   - Command: `kubectl apply -f k8s/security/isolate-pod-networkpolicy.yaml -n sentinelopsai`
2. **Terminate Compromised Pod (Medium Risk - Approval Required)**:
   - Evict and delete the compromised pod so Kubernetes controller schedules a pristine replica.
   - Command: `kubectl delete pod {pod} -n sentinelopsai --grace-period=0 --force`
3. **Block Rogue Source IP (Medium Risk - Approval Required)**:
   - Add firewall rule to block attacking client IP address.
   - Command: `ufw deny from {ip}`
4. **Trigger Vulnerability Scan (Low Risk - Safe)**:
   - Scan container image with Trivy for known CVEs.
