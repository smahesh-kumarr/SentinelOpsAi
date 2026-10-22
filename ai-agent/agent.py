import logging
from datetime import datetime
from db import (
    get_pending_remediations,
    get_incident_by_id,
    update_incident_status,
    update_recommendation_status,
    log_audit,
)
from executor import execute_action
from verifier import verify_remediation

logger = logging.getLogger("ai_agent.engine")

def run_remediation_cycle() -> dict:
    """
    Main autonomous remediation loop:
    1. Finds analyzed incidents with auto_approved recommendations.
    2. Executes safe actions against the cluster.
    3. Runs closed-loop verification to confirm health.
    4. Updates incident state to 'resolved' or 'escalated'.
    """
    pending = get_pending_remediations(limit=5)
    if not pending:
        return {
            "status": "idle",
            "pending_count": 0,
            "executed_count": 0,
            "remediated": []
        }

    logger.info(f"Remediation Agent evaluating {len(pending)} analyzed incidents...")
    remediated_list = []

    for inc in pending:
        inc_id = inc.get("id", inc.get("_id"))
        service = inc.get("service", "backend")
        recs = inc.get("recommendations", [])

        # Look for auto-approved actions
        has_auto_action = any(r.get("status") == "auto_approved" for r in recs)
        if not has_auto_action:
            logger.debug(f"Incident {inc_id} has no auto-approved actions; awaiting human sign-off.")
            continue

        update_incident_status(inc_id, "in_remediation")
        logger.info(f"Starting automated remediation for incident '{inc.get('title')}' (ID: {inc_id})...")

        for idx, rec in enumerate(recs):
            if rec.get("status") == "auto_approved":
                action_key = rec.get("action_key")
                exec_result = execute_action(inc_id, service, rec, executor_name="autonomous_agent")

                if exec_result.get("status") == "success":
                    # Closed-loop verification
                    verification = verify_remediation(service)
                    now_iso = datetime.utcnow().isoformat()

                    if verification.get("verified"):
                        update_recommendation_status(inc_id, idx, "executed", execution_log=exec_result)
                        update_incident_status(inc_id, "resolved", {
                            "resolved_at": now_iso,
                            "remediation_summary": f"Autonomous agent executed '{action_key}'. Workload recovery verified.",
                            "verification_result": verification
                        })
                        remediated_list.append({
                            "incident_id": inc_id,
                            "service": service,
                            "action": action_key,
                            "status": "resolved",
                            "verification": verification
                        })
                    else:
                        update_recommendation_status(inc_id, idx, "executed_unverified", execution_log=exec_result)
                        update_incident_status(inc_id, "escalated", {
                            "escalated_at": now_iso,
                            "escalation_reason": "Remediation executed but workload verification failed.",
                            "verification_result": verification
                        })
                        remediated_list.append({
                            "incident_id": inc_id,
                            "service": service,
                            "action": action_key,
                            "status": "escalated",
                            "verification": verification
                        })
                elif exec_result.get("status") == "blocked":
                    update_incident_status(inc_id, "escalated", {
                        "escalation_reason": exec_result.get("reason", "Blocked by circuit breaker.")
                    })
                else:
                    update_recommendation_status(inc_id, idx, "failed", execution_log=exec_result)
                    update_incident_status(inc_id, "escalated", {
                        "escalation_reason": f"Execution failed for action '{action_key}'."
                    })

    return {
        "status": "completed",
        "pending_count": len(pending),
        "executed_count": len(remediated_list),
        "remediated": remediated_list
    }

def approve_and_execute(incident_id: str, action_index: int, approver: str = "human_operator") -> dict:
    """Human-in-the-Loop approval: Executes a medium/high risk action immediately."""
    inc = get_incident_by_id(incident_id)
    if not inc:
        return {"status": "error", "message": f"Incident '{incident_id}' not found."}

    recs = inc.get("recommendations", [])
    if action_index < 0 or action_index >= len(recs):
        return {"status": "error", "message": f"Action index {action_index} out of range."}

    target_rec = recs[action_index]
    service = inc.get("service", "backend")
    action_key = target_rec.get("action_key")

    logger.info(f"Human approval received for action '{action_key}' on incident '{incident_id}' by '{approver}'")
    update_incident_status(incident_id, "in_remediation")

    exec_result = execute_action(incident_id, service, target_rec, executor_name=approver)
    now_iso = datetime.utcnow().isoformat()

    if exec_result.get("status") == "success":
        verification = verify_remediation(service)
        if verification.get("verified"):
            update_recommendation_status(incident_id, action_index, "executed", execution_log=exec_result)
            update_incident_status(incident_id, "resolved", {
                "resolved_at": now_iso,
                "approved_by": approver,
                "remediation_summary": f"Approved action '{action_key}' executed. Workload verified healthy.",
                "verification_result": verification
            })
            return {"status": "resolved", "action": action_key, "verification": verification}
        else:
            update_recommendation_status(incident_id, action_index, "executed_unverified", execution_log=exec_result)
            update_incident_status(incident_id, "escalated", {
                "escalated_at": now_iso,
                "approved_by": approver,
                "escalation_reason": "Approved action executed but verification failed.",
                "verification_result": verification
            })
            return {"status": "escalated", "action": action_key, "verification": verification}

    update_recommendation_status(incident_id, action_index, "failed", execution_log=exec_result)
    return {"status": "failed", "error": exec_result.get("error")}

def reject_action(incident_id: str, action_index: int, rejector: str = "human_operator", reason: str = "") -> dict:
    """Human operator rejects recommended action."""
    inc = get_incident_by_id(incident_id)
    if not inc:
        return {"status": "error", "message": f"Incident '{incident_id}' not found."}

    recs = inc.get("recommendations", [])
    if action_index < 0 or action_index >= len(recs):
        return {"status": "error", "message": "Invalid action index."}

    target_rec = recs[action_index]
    target_rec["status"] = "rejected"
    target_rec["rejected_by"] = rejector
    target_rec["rejection_reason"] = reason

    update_recommendation_status(incident_id, action_index, "rejected", execution_log={"reason": reason})
    log_audit({
        "incident_id": incident_id,
        "service": inc.get("service"),
        "action_key": target_rec.get("action_key"),
        "status": "rejected",
        "executor": rejector,
        "reason": reason
    })

    return {"status": "rejected", "action": target_rec.get("action_key"), "reason": reason}
