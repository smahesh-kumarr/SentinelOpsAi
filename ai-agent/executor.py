import logging
from k8s_client import restart_deployment, scale_deployment, isolate_workload
from circuit_breaker import can_execute, record_execution
from db import log_audit

logger = logging.getLogger("ai_agent.executor")

def execute_action(
    incident_id: str,
    service: str,
    rec_item: dict,
    executor_name: str = "autonomous_agent"
) -> dict:
    """Execute a single remediation action against the cluster."""
    action_key = rec_item.get("action_key", "investigate")
    suggested_cmd = rec_item.get("suggested_command", "")

    # Check circuit breaker safety
    allowed, reason = can_execute(service)
    if not allowed:
        audit_entry = {
            "incident_id": incident_id,
            "service": service,
            "action_key": action_key,
            "command": suggested_cmd,
            "status": "blocked_by_circuit_breaker",
            "executor": executor_name,
            "detail": reason
        }
        log_audit(audit_entry)
        return {"status": "blocked", "reason": reason}

    logger.info(f"Executing remediation '{action_key}' on '{service}' by {executor_name}...")

    try:
        if action_key == "restart_deployment":
            result = restart_deployment(service)
        elif action_key == "scale_deployment":
            result = scale_deployment(service, replicas=2)
        elif action_key == "isolate_pod":
            result = isolate_workload(service)
        else:
            result = {"status": "manual_action_required", "action": action_key}

        # Record in circuit breaker and audit log
        record_execution(service, action_key)
        audit_entry = {
            "incident_id": incident_id,
            "service": service,
            "action_key": action_key,
            "command": suggested_cmd,
            "status": "success",
            "executor": executor_name,
            "result": result
        }
        log_audit(audit_entry)
        return {"status": "success", "result": result}

    except Exception as exc:
        logger.error(f"Execution failed for action '{action_key}' on '{service}': {exc}", exc_info=True)
        audit_entry = {
            "incident_id": incident_id,
            "service": service,
            "action_key": action_key,
            "command": suggested_cmd,
            "status": "failed",
            "executor": executor_name,
            "error": str(exc)
        }
        log_audit(audit_entry)
        return {"status": "failed", "error": str(exc)}
