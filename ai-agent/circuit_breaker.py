import time
import logging
from collections import defaultdict

logger = logging.getLogger("ai_agent.circuit_breaker")

# Max automated actions per hour per service
MAX_ACTIONS_PER_HOUR = 3
WINDOW_SECONDS = 3600

_execution_history = defaultdict(list)

def can_execute(service: str) -> tuple[bool, str]:
    """Check if the circuit breaker allows remediation on this service."""
    now = time.time()
    cutoff = now - WINDOW_SECONDS

    # Clean old entries
    _execution_history[service] = [t for t in _execution_history[service] if t >= cutoff]
    recent_count = len(_execution_history[service])

    if recent_count >= MAX_ACTIONS_PER_HOUR:
        msg = (
            f"Circuit breaker TRIPPED for service '{service}': "
            f"{recent_count} actions executed in the past hour (Limit: {MAX_ACTIONS_PER_HOUR}). "
            f"Halting automated remediations to avoid cascading instability."
        )
        logger.warning(msg)
        return False, msg

    return True, f"Circuit closed ({recent_count}/{MAX_ACTIONS_PER_HOUR} actions used in past hour)."

def record_execution(service: str, action_key: str):
    """Record an action execution timestamp."""
    _execution_history[service].append(time.time())
    logger.info(f"Recorded action '{action_key}' execution for service '{service}'.")

def get_stats() -> dict:
    now = time.time()
    cutoff = now - WINDOW_SECONDS
    stats = {}
    for svc, timestamps in _execution_history.items():
        valid = [t for t in timestamps if t >= cutoff]
        stats[svc] = {
            "actions_last_hour": len(valid),
            "max_allowed": MAX_ACTIONS_PER_HOUR,
            "circuit_status": "OPEN" if len(valid) >= MAX_ACTIONS_PER_HOUR else "CLOSED"
        }
    return stats
