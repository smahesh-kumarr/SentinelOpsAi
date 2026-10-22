from policy.policy_map import POLICY, normalize_action

def enrich_recommendations(raw_recommendations: list, service: str, confidence: float = 90.0) -> list:
    """
    Enrich raw AI action suggestions with policy guardrails,
    risk ratings, executable command templates, and approval state.
    """
    enriched = []
    for rec in raw_recommendations:
        action_text = rec.get("action", "")
        action_key = normalize_action(action_text)
        policy_item = POLICY.get(action_key, POLICY["investigate"])

        # Determine formatting variables
        replicas = rec.get("replicas", "2")
        memory = rec.get("memory", "512Mi")
        pod = rec.get("pod", f"{service}-0")

        cmd = None
        if policy_item.get("command_template"):
            cmd = policy_item["command_template"].format(
                service=service,
                replicas=replicas,
                memory=memory,
                pod=pod
            )

        # Autonomous vs Human-in-the-Loop decision:
        # Autonomous if policy allows AND AI confidence >= 85%
        approval_required = policy_item["approval_required"]
        if not approval_required and confidence >= 85.0:
            status = "auto_approved"
        else:
            status = "pending_human_approval"

        enriched.append({
            "action": action_text,
            "action_key": action_key,
            "risk": policy_item["risk"],
            "approval_required": approval_required,
            "suggested_command": cmd,
            "description": policy_item.get("description", ""),
            "status": status
        })

    return enriched
