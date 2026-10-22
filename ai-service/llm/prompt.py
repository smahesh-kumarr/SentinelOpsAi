import json

def build_rca_prompt(incident_title: str, service: str, severity: str, evidence: list, context: str) -> str:
    """Build grounded prompt for SRE Root Cause Analysis."""
    return f"""You are SentinelOpsAI, an autonomous Kubernetes Site Reliability Engineering (SRE) reasoning engine.

Analyze the following correlated incident using the provided multi-source telemetry evidence and grounded SRE runbook documentation.

Incident Title: {incident_title}
Service Target: {service}
Severity: {severity}

Correlated Telemetry Evidence (Prometheus / Loki / K8s / Falco):
{json.dumps(evidence, indent=2, default=str)}

Grounded SRE Runbook Documentation:
{context}

Analyze the sequence of events and diagnose the definitive root cause.
Respond with ONLY valid raw JSON in the following exact format (no markdown code fences, no extra text):
{{
  "root_cause": "Clear, technical explanation of why the failure occurred citing telemetry evidence and runbook diagnostics",
  "confidence": 92.0,
  "recommendations": [
    {{
      "action": "Specific remediation action (e.g. restart deployment, scale deployment, isolate pod)",
      "risk": "low"
    }}
  ]
}}"""
