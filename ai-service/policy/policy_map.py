"""
SentinelOpsAI Policy Guardrails:
Defines safety constraints, risk levels, and executable command templates.
"""

POLICY = {
    "restart_deployment": {
        "risk": "low",
        "approval_required": False,
        "command_template": "kubectl rollout restart deployment {service} -n sentinelopsai",
        "description": "Trigger rolling restart of application pods to clear memory leak and restore fresh state."
    },
    "scale_deployment": {
        "risk": "low",
        "approval_required": False,
        "command_template": "kubectl scale deployment {service} --replicas={replicas} -n sentinelopsai",
        "description": "Increase replica count to distribute high CPU/memory load across multiple instances."
    },
    "rollback_deployment": {
        "risk": "medium",
        "approval_required": True,
        "command_template": "kubectl rollout undo deployment {service} -n sentinelopsai",
        "description": "Revert to previous deployment revision due to crashloop or bootstrap regression."
    },
    "increase_memory_limit": {
        "risk": "medium",
        "approval_required": True,
        "command_template": "kubectl set resources deployment {service} --limits=memory={memory} -n sentinelopsai",
        "description": "Adjust container memory limits to accommodate higher memory demand."
    },
    "isolate_pod": {
        "risk": "high",
        "approval_required": True,
        "command_template": "kubectl apply -f k8s/security/isolate-pod-networkpolicy.yaml -n sentinelopsai",
        "description": "Isolate compromised container using zero-trust NetworkPolicy to prevent lateral movement."
    },
    "terminate_pod": {
        "risk": "medium",
        "approval_required": True,
        "command_template": "kubectl delete pod {pod} -n sentinelopsai --grace-period=0 --force",
        "description": "Forcefully terminate compromised or deadlocked pod."
    },
    "investigate": {
        "risk": "info",
        "approval_required": True,
        "command_template": None,
        "description": "Manual SRE inspection of logs and application stack."
    }
}

def normalize_action(text: str) -> str:
    """Normalize raw AI recommendation string to standard policy action key."""
    t = text.lower()
    if "restart" in t and ("deployment" in t or "rollout" in t or "pod" in t):
        return "restart_deployment"
    if "scale" in t or "replica" in t:
        return "scale_deployment"
    if "rollback" in t or "roll back" in t or "undo" in t or "revert" in t:
        return "rollback_deployment"
    if "memory" in t and ("limit" in t or "increase" in t or "raise" in t):
        return "increase_memory_limit"
    if "isolate" in t or "quarantine" in t or "network policy" in t or "networkpolicy" in t:
        return "isolate_pod"
    if "terminate" in t or "kill pod" in t or "delete pod" in t:
        return "terminate_pod"
    return "investigate"
