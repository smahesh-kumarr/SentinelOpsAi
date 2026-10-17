import os
import sys
import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from schemas import EventIn
from db import init_db, save_event, get_events, is_connected
from pollers.prometheus_poller import poll_prometheus
from pollers.loki_poller import poll_loki
from pollers.k8s_poller import poll_k8s

# Configure structured JSON logging
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "level": record.levelname.lower(),
            "msg": record.getMessage(),
            "service": "collector",
            "name": record.name,
        }
        return json.dumps(log_obj)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
logger = logging.getLogger("collector")

POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL_SECONDS", 30))
scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB and schedule pollers
    logger.info("Initializing SentinelOps Collector database connection...")
    init_db()

    logger.info(f"Starting background telemetry pollers (Interval: {POLL_INTERVAL}s)...")
    scheduler.add_job(poll_prometheus, "interval", seconds=POLL_INTERVAL, args=[save_event], id="prometheus_poller")
    scheduler.add_job(poll_loki, "interval", seconds=POLL_INTERVAL, args=[save_event], id="loki_poller")
    scheduler.add_job(poll_k8s, "interval", seconds=POLL_INTERVAL, args=[save_event], id="k8s_poller")
    scheduler.start()

    yield

    # Shutdown: Cleanly stop scheduler
    logger.info("Shutting down background telemetry pollers...")
    scheduler.shutdown(wait=False)

app = FastAPI(
    title="SentinelOpsAI Telemetry Collector",
    description="Multi-source ingestion service for Prometheus metrics, Loki logs, K8s events, and Falco threats",
    version="2.0.0",
    lifespan=lifespan,
)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "collector",
        "mongoConnected": is_connected(),
        "pollIntervalSeconds": POLL_INTERVAL,
        "activeJobs": [job.id for job in scheduler.get_jobs()]
    }

@app.get("/events")
def list_events(
    processed: bool | None = Query(None, description="Filter by correlation processed status"),
    limit: int = Query(100, ge=1, le=500, description="Max events to return")
):
    """Retrieve normalized events from the central event store."""
    events = get_events(processed=processed, limit=limit)
    return {"count": len(events), "events": events}

@app.post("/events")
def receive_event(event: EventIn):
    """Generic event ingestion endpoint."""
    saved = save_event(event.model_dump())
    logger.info(f"Ingested external event from source '{event.source}' for service '{event.service}'")
    return {"status": "accepted", "event": saved}

@app.post("/events/falco")
def receive_falco_event(payload: dict):
    """Webhook endpoint for Falcosidekick runtime security alerts."""
    rule = payload.get("rule", "Unknown Falco Rule")
    priority = payload.get("priority", "Notice")
    output = payload.get("output", "")
    output_fields = payload.get("output_fields", {})
    pod_name = output_fields.get("k8s.pod.name", "unknown")

    logger.warning(f"Falco alert received: [{priority}] {rule} on pod '{pod_name}'")
    
    event_data = {
        "source": "falco",
        "service": pod_name,
        "severity": priority.lower(),
        "data": {
            "rule": rule,
            "output": output,
            "output_fields": output_fields,
            "raw": payload
        }
    }
    saved = save_event(event_data)
    return {"status": "accepted", "source": "falco", "rule": rule, "event_id": saved.get("id")}

@app.post("/poll/now")
async def trigger_manual_poll():
    """Manual trigger to execute all 3 pollers immediately."""
    await poll_prometheus(save_event)
    await poll_loki(save_event)
    poll_k8s(save_event)
    return {"status": "triggered", "message": "Prometheus, Loki, and K8s pollers executed"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
