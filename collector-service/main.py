from fastapi import FastAPI
from schemas import EventIn
import logging
import json
import sys

# Configure structured JSON logging for collector
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

app = FastAPI(
    title="SentinelOpsAI Collector Service",
    description="Telemetry ingestion and collection scaffold for Prometheus, Loki, and Falco signals",
    version="1.0.0",
)

@app.get("/health")
def health():
    return {"status": "ok", "service": "collector"}

@app.post("/events")
def receive_event(event: EventIn):
    logger.info(json.dumps({"received_event": event.model_dump()}))
    return {"status": "accepted", "event": event}

if __name__ == "__main__":
    import uvicorn
    # --host 0.0.0.0 is strictly required for container and cluster communication
    uvicorn.run(app, host="0.0.0.0", port=8000)
