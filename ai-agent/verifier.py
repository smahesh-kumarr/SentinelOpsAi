import time
import logging
from k8s_client import check_deployment_ready

logger = logging.getLogger("ai_agent.verifier")

def verify_remediation(service: str, max_retries: int = 6, delay_seconds: int = 5) -> dict:
    """
    Closed-Loop Verification:
    Polls Kubernetes to confirm the workload successfully recovered and ready replicas are healthy.
    """
    logger.info(f"Starting closed-loop verification for service '{service}' (Max wait: {max_retries * delay_seconds}s)...")

    for attempt in range(1, max_retries + 1):
        time.sleep(delay_seconds)
        status = check_deployment_ready(service)
        logger.debug(f"Verification attempt {attempt}/{max_retries} for '{service}': {status}")

        if status.get("is_ready"):
            logger.info(f"✓ Verification SUCCESS: Workload '{service}' is healthy and fully ready.")
            return {
                "verified": True,
                "ready_replicas": status.get("ready_replicas"),
                "desired_replicas": status.get("desired_replicas"),
                "attempts": attempt,
                "message": "Deployment recovered to desired healthy state."
            }

    logger.warning(f"✗ Verification FAILED: Workload '{service}' did not reach healthy state in time.")
    return {
        "verified": False,
        "attempts": max_retries,
        "message": "Deployment failed to reach readiness within verification window."
    }
