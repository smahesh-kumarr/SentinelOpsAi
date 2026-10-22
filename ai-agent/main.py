import os
import sys
import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, HTTPException, Body
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db import init_db, is_connected, get_audit_history
from k8s_client import init_k8s, is_k8s_connected
from circuit_breaker import get_stats
from agent import run_remediation_cycle, approve_and_execute, reject_action

# Configure structured JSON logging
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "level": record.levelname.lower(),
            "msg": record.getMessage(),
            "service": "ai-agent",
            "name": record.name,
        }
        return json.dumps(log_obj)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
logger = logging.getLogger("ai_agent")

POLL_INTERVAL = int(os.environ.get("AGENT_POLL_INTERVAL_SECONDS", 15))
scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing SentinelOps Remediation Agent database connection...")
    init_db()

    logger.info("Initializing Kubernetes API client...")
    init_k8s()

    logger.info(f"Starting background autonomous remediation scheduler (Interval: {POLL_INTERVAL}s)...")
    scheduler.add_job(
        run_remediation_cycle,
        "interval",
        seconds=POLL_INTERVAL,
        id="remediation_agent_worker"
    )
    scheduler.start()

    yield

    # Shutdown
    logger.info("Shutting down Remediation Agent scheduler...")
    scheduler.shutdown(wait=False)

app = FastAPI(
    title="SentinelOpsAI Autonomous Remediation Agent",
    description="Safety-governed autonomous self-healing agent executing closed-loop remediations on Kubernetes",
    version="2.0.0",
    lifespan=lifespan,
)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "ai-agent",
        "mongoConnected": is_connected(),
        "k8sConnected": is_k8s_connected(),
        "pollIntervalSeconds": POLL_INTERVAL,
        "activeJobs": [job.id for job in scheduler.get_jobs()],
        "circuitBreaker": get_stats()
    }

@app.post("/remediate/now")
def trigger_remediation_now():
    """Manual trigger to execute the autonomous remediation loop immediately."""
    result = run_remediation_cycle()
    return result

@app.post("/incidents/{incident_id}/approve/{action_index}")
def approve_action(
    incident_id: str,
    action_index: int,
    approver: str = Query("human_operator", description="Name of approving operator")
):
    """Human-in-the-Loop endpoint to approve and execute a pending recommendation."""
    result = approve_and_execute(incident_id, action_index, approver)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@app.post("/incidents/{incident_id}/reject/{action_index}")
def reject_recommendation(
    incident_id: str,
    action_index: int,
    rejector: str = Query("human_operator", description="Name of operator rejecting action"),
    reason: str = Query("Action rejected by operator", description="Reason for rejection")
):
    """Human operator rejects recommended action."""
    result = reject_action(incident_id, action_index, rejector, reason)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@app.get("/audit/history")
def audit_history(limit: int = Query(50, ge=1, le=200)):
    """Retrieve immutable audit history of all automated and manual actions executed."""
    history = get_audit_history(limit=limit)
    return {
        "count": len(history),
        "audit_trail": history
    }

@app.get("/circuit-breaker/status")
def circuit_breaker_status():
    """Retrieve current circuit breaker stats and rate-limiting counters."""
    return get_stats()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
