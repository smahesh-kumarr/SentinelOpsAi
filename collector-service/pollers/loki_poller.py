import os
import time
import logging
import httpx

logger = logging.getLogger("collector.poller.loki")

LOKI_URL = os.environ.get("LOKI_URL", "http://loki.monitoring.svc.cluster.local:3100")
NAMESPACE = os.environ.get("K8S_NAMESPACE", "sentinelopsai")

# Cache to avoid saving duplicate identical log lines within short windows
_seen_log_timestamps = set()

async def poll_loki(save_event_fn):
    global _seen_log_timestamps
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            now_ns = int(time.time() * 1e9)
            start_ns = now_ns - 60_000_000_000 # Past 60 seconds

            # Query error-level or OOM log messages
            query = f'{{namespace="{NAMESPACE}"}} |= "error" or {{namespace="{NAMESPACE}"}} |= "Error" or {{namespace="{NAMESPACE}"}} |= "OutOfMemory"'
            resp = await client.get(
                f"{LOKI_URL}/loki/api/v1/query_range",
                params={"query": query, "start": start_ns, "end": now_ns, "limit": 20}
            )

            if resp.status_code == 200:
                streams = resp.json().get("data", {}).get("result", [])
                for stream in streams:
                    stream_labels = stream.get("stream", {})
                    service = stream_labels.get("app", stream_labels.get("service", "backend"))
                    
                    for entry in stream.get("values", []):
                        ts_ns, log_line = entry[0], entry[1]
                        entry_key = f"{ts_ns}:{service}"
                        
                        if entry_key not in _seen_log_timestamps:
                            _seen_log_timestamps.add(entry_key)
                            # Keep cache size bounded
                            if len(_seen_log_timestamps) > 500:
                                _seen_log_timestamps.clear()

                            logger.warning(f"Loki detected error log on {service}: {log_line[:100]}")
                            save_event_fn({
                                "source": "loki",
                                "service": service,
                                "severity": "error",
                                "data": {
                                    "log": log_line,
                                    "timestamp_ns": ts_ns,
                                    "pod": stream_labels.get("pod", "unknown")
                                }
                            })

    except httpx.RequestError as exc:
        logger.debug(f"Loki not reachable at {LOKI_URL}: {exc}")
    except Exception as exc:
        logger.error(f"Error in Loki poller: {exc}", exc_info=True)
