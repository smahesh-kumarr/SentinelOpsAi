import os
import sys
import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, HTTPException
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db import init_db, is_connected, get_incidents, get_incident_by_id
from rag.vector_store import init_vector_store, is_qdrant_active
from rag.ingest import ingest_runbooks
from rag.retriever import retrieve_context
from analyzer import run_analysis

# Structured JSON logging
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "level": record.levelname.lower(),
            "msg": record.getMessage(),
            "service": "ai-service",
            "name": record.name,
        }
        return json.dumps(log_obj)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
logger = logging.getLogger("ai_service")

ANALYSIS_INTERVAL = int(os.environ.get("ANALYSIS_INTERVAL_SECONDS", 20))
scheduler = AsyncIOScheduler()
_indexed_chunks = 0

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _indexed_chunks
    # 1. Init Database
    logger.info("Initializing SentinelOps AI Service database connection...")
    init_db()

    # 2. Init Vector Store & Ingest Runbooks
    logger.info("Initializing Vector Store & Indexing SRE Runbooks...")
    init_vector_store()
    _indexed_chunks = ingest_runbooks()

    # 3. Schedule background analysis worker
    logger.info(f"Starting background AI analysis scheduler (Interval: {ANALYSIS_INTERVAL}s)...")
    scheduler.add_job(
        run_analysis,
        "interval",
        seconds=ANALYSIS_INTERVAL,
        id="ai_rca_worker"
    )
    scheduler.start()

    yield

    # Shutdown
    logger.info("Shutting down AI analysis scheduler...")
    scheduler.shutdown(wait=False)

app = FastAPI(
    title="SentinelOpsAI Root Cause Analysis & RAG Service",
    description="Intelligent SRE reasoning engine grounding correlated incidents in runbooks via Vector RAG",
    version="2.0.0",
    lifespan=lifespan,
)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "ai-service",
        "mongoConnected": is_connected(),
        "qdrantConnected": is_qdrant_active(),
        "indexedRunbookChunks": _indexed_chunks,
        "analysisIntervalSeconds": ANALYSIS_INTERVAL,
        "activeJobs": [job.id for job in scheduler.get_jobs()]
    }

@app.post("/analyze/now")
async def trigger_analysis_now():
    """Manual trigger to execute AI Root Cause Analysis cycle immediately."""
    result = await run_analysis()
    return result

@app.post("/rag/ingest")
def trigger_reingest():
    """Re-index all markdown runbooks from knowledge_base directory."""
    global _indexed_chunks
    _indexed_chunks = ingest_runbooks()
    return {
        "status": "reindexed",
        "indexedRunbookChunks": _indexed_chunks
    }

@app.get("/rag/search")
def test_retriever(q: str = Query(..., description="Query text to search in knowledge base")):
    """Test endpoint for semantic runbook retrieval."""
    context = retrieve_context(q, top_k=3)
    return {
        "query": q,
        "retrieved_context": context
    }

@app.get("/incidents/analyzed")
def list_analyzed_incidents(limit: int = Query(50, ge=1, le=100)):
    """Retrieve all incidents with completed AI Root Cause Analysis."""
    incidents = get_incidents(status="analyzed", limit=limit)
    return {
        "count": len(incidents),
        "incidents": incidents
    }

@app.get("/incidents/{incident_id}")
def get_incident_detail(incident_id: str):
    """Retrieve single incident analysis."""
    inc = get_incident_by_id(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return inc

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
