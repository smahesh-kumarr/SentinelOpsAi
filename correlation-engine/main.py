import os
import sys
import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, HTTPException, status
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from schemas import IncidentStatusUpdate, IncidentOut
from db import (
    init_db,
    is_connected,
    get_incidents,
    get_incident_by_id,
    update_incident_status,
    get_summary,
)
from correlator import run_correlation

# Configure structured JSON logging
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "level": record.levelname.lower(),
            "msg": record.getMessage(),
            "service": "correlation-engine",
            "name": record.name,
        }
        return json.dumps(log_obj)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
logger = logging.getLogger("correlation")

CORRELATE_INTERVAL = int(os.environ.get("CORRELATE_INTERVAL_SECONDS", 15))
scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing SentinelOps Correlation Engine database connection...")
    init_db()

    logger.info(f"Starting background correlation scheduler (Interval: {CORRELATE_INTERVAL}s)...")
    scheduler.add_job(
        run_correlation,
        "interval",
        seconds=CORRELATE_INTERVAL,
        id="cross_domain_correlator"
    )
    scheduler.start()

    yield

    # Shutdown
    logger.info("Shutting down correlation scheduler...")
    scheduler.shutdown(wait=False)

app = FastAPI(
    title="SentinelOpsAI Correlation Engine",
    description="Cross-Domain Telemetry Fusion & Incident Correlation Engine for Kubernetes",
    version="2.0.0",
    lifespan=lifespan,
)

@app.get("/health")
def health():
    stats = get_summary()
    return {
        "status": "ok",
        "service": "correlation-engine",
        "mongoConnected": is_connected(),
        "correlateIntervalSeconds": CORRELATE_INTERVAL,
        "activeJobs": [job.id for job in scheduler.get_jobs()],
        "incidentStats": stats
    }

@app.post("/correlate/now")
def trigger_correlation_now():
    """Manual trigger to execute cross-domain correlation cycle immediately."""
    result = run_correlation()
    return result

@app.get("/incidents")
def list_incidents(
    status: str | None = Query(None, description="Filter by status: open, in_progress, resolved, closed"),
    service: str | None = Query(None, description="Filter by service name, e.g. backend"),
    incident_type: str | None = Query(None, description="Filter by type, e.g. memory_failure, crashloop, security_threat"),
    limit: int = Query(50, ge=1, le=200, description="Max incidents to return")
):
    """Retrieve correlated incidents from the central incident store."""
    incidents = get_incidents(status=status, service=service, incident_type=incident_type, limit=limit)
    return {
        "count": len(incidents),
        "incidents": incidents
    }

@app.get("/incidents/{incident_id}")
def get_incident(incident_id: str):
    """Retrieve full details of a specific incident including multi-source evidence."""
    inc = get_incident_by_id(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident with ID '{incident_id}' not found")
    return inc

@app.patch("/incidents/{incident_id}")
def update_status(incident_id: str, payload: IncidentStatusUpdate):
    """Update status of an incident (e.g. open -> in_progress -> resolved)."""
    success = update_incident_status(incident_id, payload.status)
    if not success:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found or could not be updated")
    return {
        "status": "updated",
        "incident_id": incident_id,
        "new_status": payload.status
    }

@app.get("/incidents/stats/summary")
def incidents_summary():
    """Aggregated incident metrics for dashboard widgets."""
    return get_summary()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
