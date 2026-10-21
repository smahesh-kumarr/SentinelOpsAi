import re
import logging

logger = logging.getLogger("correlation.rules")

def normalize_service(service: str) -> str:
    """Normalize Kubernetes pod names to parent workload service names (e.g. backend-79f98444dc-z98qk -> backend)."""
    if not service:
        return "unknown"
    # Strip pod replica hashes: e.g., app-name-6799865d89-9r7zb -> app-name
    normalized = re.sub(r'-[a-z0-9]{5,10}-[a-z0-9]{5}$', '', service)
    # Strip single hash suffix if present: e.g., app-name-6799865d89 -> app-name
    normalized = re.sub(r'-[a-z0-9]{8,10}$', '', normalized)
    return normalized

def summarize_evidence(groups: list) -> list:
    """Flatten event lists and extract clean evidence items."""
    evidence = []
    seen = set()
    for group in groups:
        for e in group:
            eid = str(e.get("id", e.get("_id", "")))
            if eid and eid in seen:
                continue
            if eid:
                seen.add(eid)
            evidence.append({
                "id": eid,
                "source": e.get("source"),
                "severity": e.get("severity", "info"),
                "timestamp": e.get("timestamp"),
                "data": e.get("data", {})
            })
    return evidence

def rule_memory_failure(events: list[dict]) -> dict | None:
    """
    Most specific rule:
    Prometheus memory spike + Loki OOM error log + K8s OOMKilled / pod restart.
    """
    mem = [
        e for e in events 
        if e.get("source") == "prometheus" and e.get("data", {}).get("metric") == "memory"
    ]
    
    oom_logs = [
        e for e in events 
        if e.get("source") == "loki" and any(
            kw in str(e.get("data", {}).get("log", "")).lower() 
            for kw in ["outofmemory", "heap out of memory", "oom", "killed", "heap limit"]
        )
    ]

    restarts = [
        e for e in events 
        if e.get("source") == "k8s" and (
            e.get("data", {}).get("terminated_reason") == "OOMKilled" or 
            e.get("data", {}).get("restart_count", 0) > 0
        )
    ]

    oom_killed_direct = [
        e for e in events
        if e.get("source") == "k8s" and e.get("data", {}).get("terminated_reason") == "OOMKilled"
    ]

    # Trigger if (memory metric and either restart or OOM log) OR direct K8s OOMKilled event
    if (mem and (restarts or oom_logs)) or oom_killed_direct:
        logger.info("Rule matched: rule_memory_failure (multi-source cross-domain correlation)")
        return {
            "title": "Backend Memory Leak & OOM Failure Risk",
            "incident_type": "memory_failure",
            "severity": "critical",
            "description": (
                "Cross-domain telemetry correlation detected critical memory exhaustion. "
                "Prometheus memory metric exceeded safety threshold (90%), paired with "
                "container restart/OOMKilled events and fatal memory error logs."
            ),
            "evidence": summarize_evidence([mem, oom_logs, restarts])
        }
    return None

def rule_crashloop(events: list[dict]) -> dict | None:
    """
    K8s pod in CrashLoopBackOff or high restart count where memory failure is NOT the culprit.
    """
    crashes = [
        e for e in events 
        if e.get("source") == "k8s" and (
            e.get("data", {}).get("waiting_reason") == "CrashLoopBackOff" or 
            e.get("data", {}).get("restart_count", 0) >= 3
        )
    ]
    
    # Exclude if already memory related
    has_mem = any(
        e.get("source") == "prometheus" and e.get("data", {}).get("metric") == "memory" 
        for e in events
    )
    has_oom = any(
        e.get("source") == "k8s" and e.get("data", {}).get("terminated_reason") == "OOMKilled" 
        for e in events
    )

    if crashes and not (has_mem or has_oom):
        error_logs = [e for e in events if e.get("source") == "loki"]
        logger.info("Rule matched: rule_crashloop")
        return {
            "title": "Service CrashLoopBackOff Detected",
            "incident_type": "crashloop",
            "severity": "critical",
            "description": (
                "Kubernetes pod is repeatedly crashing and failing liveness/readiness probes "
                "without recovering. Immediate container inspection is required."
            ),
            "evidence": summarize_evidence([crashes, error_logs])
        }
    return None

def rule_security_threat(events: list[dict]) -> dict | None:
    """
    Falco runtime security violation (unauthorized interactive shell, spawned process, or sensitive file access).
    """
    falco_alerts = [e for e in events if e.get("source") == "falco"]
    if falco_alerts:
        rule_name = falco_alerts[0].get("data", {}).get("rule", "Runtime Security Breach")
        sev = falco_alerts[0].get("severity", "critical")
        if sev not in ["critical", "high"]:
            sev = "critical" if any(f.get("severity") in ["critical", "emergency", "alert"] for f in falco_alerts) else "high"

        logger.info(f"Rule matched: rule_security_threat ({rule_name})")
        return {
            "title": f"Runtime Security Violation: {rule_name}",
            "incident_type": "security_threat",
            "severity": sev,
            "description": (
                f"Falco eBPF sensor detected a live runtime security violation on container workload: "
                f"{rule_name}. Correlated with audit event stream."
            ),
            "evidence": summarize_evidence([falco_alerts])
        }
    return None

def rule_performance_degradation(events: list[dict]) -> dict | None:
    """
    High CPU saturation (> 90%) from Prometheus.
    """
    cpu_events = [
        e for e in events 
        if e.get("source") == "prometheus" and e.get("data", {}).get("metric") == "cpu"
    ]
    if cpu_events:
        logger.info("Rule matched: rule_performance_degradation")
        return {
            "title": "High CPU Saturation & Latency Risk",
            "incident_type": "performance_degradation",
            "severity": "warning",
            "description": (
                "Prometheus reported container CPU usage exceeding 90% threshold. "
                "Service is at risk of thread starvation and elevated request latency."
            ),
            "evidence": summarize_evidence([cpu_events])
        }
    return None

# Rules ordered from most specific to general
ALL_RULES = [
    rule_memory_failure,
    rule_crashloop,
    rule_security_threat,
    rule_performance_degradation,
]
