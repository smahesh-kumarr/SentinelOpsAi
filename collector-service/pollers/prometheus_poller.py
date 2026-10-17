import os
import logging
import httpx

logger = logging.getLogger("collector.poller.prometheus")

PROM_URL = os.environ.get("PROMETHEUS_URL", "http://monitoring-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090")
NAMESPACE = os.environ.get("K8S_NAMESPACE", "sentinelopsai")
MEMORY_LIMIT_BYTES = 209715200 # 200Mi deliberate backend limit
MEMORY_THRESHOLD_BYTES = int(0.9 * MEMORY_LIMIT_BYTES) # 188743680 (90%)

async def poll_prometheus(save_event_fn):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # 1. Check Container Memory
            mem_query = f'sum(container_memory_working_set_bytes{{namespace="{NAMESPACE}", container="backend"}}) by (pod)'
            mem_resp = await client.get(f"{PROM_URL}/api/v1/query", params={"query": mem_query})
            
            if mem_resp.status_code == 200:
                data = mem_resp.json().get("data", {}).get("result", [])
                for r in data:
                    pod = r.get("metric", {}).get("pod", "backend")
                    val_bytes = float(r.get("value", [0, 0])[1])
                    if val_bytes >= MEMORY_THRESHOLD_BYTES:
                        sev = "critical" if val_bytes >= MEMORY_LIMIT_BYTES else "warning"
                        logger.warning(
                            f"Prometheus memory anomaly on {pod}: {val_bytes / (1024*1024):.1f}MiB exceeds 90% threshold"
                        )
                        save_event_fn({
                            "source": "prometheus",
                            "service": pod,
                            "severity": sev,
                            "data": {
                                "metric": "memory",
                                "value_bytes": val_bytes,
                                "value_mib": round(val_bytes / (1024 * 1024), 2),
                                "limit_bytes": MEMORY_LIMIT_BYTES,
                                "threshold_bytes": MEMORY_THRESHOLD_BYTES
                            }
                        })

            # 2. Check Container CPU
            cpu_query = f'sum(rate(container_cpu_usage_seconds_total{{namespace="{NAMESPACE}", container!=""}}[2m])) by (pod) * 100'
            cpu_resp = await client.get(f"{PROM_URL}/api/v1/query", params={"query": cpu_query})
            if cpu_resp.status_code == 200:
                data = cpu_resp.json().get("data", {}).get("result", [])
                for r in data:
                    pod = r.get("metric", {}).get("pod", "unknown")
                    cpu_pct = float(r.get("value", [0, 0])[1])
                    if cpu_pct > 90.0:
                        logger.warning(f"Prometheus CPU spike on {pod}: {cpu_pct:.1f}%")
                        save_event_fn({
                            "source": "prometheus",
                            "service": pod,
                            "severity": "warning",
                            "data": {
                                "metric": "cpu",
                                "value_percent": round(cpu_pct, 2),
                                "threshold_percent": 90.0
                            }
                        })

    except httpx.RequestError as exc:
        logger.debug(f"Prometheus not reachable at {PROM_URL}: {exc}")
    except Exception as exc:
        logger.error(f"Error in Prometheus poller: {exc}", exc_info=True)
