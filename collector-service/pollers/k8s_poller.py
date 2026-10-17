import os
import logging
from kubernetes import client, config

logger = logging.getLogger("collector.poller.k8s")

NAMESPACE = os.environ.get("K8S_NAMESPACE", "sentinelopsai")

# Cache to track previous restart counts to only fire on new restarts
_last_known_restarts = {}

def _init_k8s_client():
    try:
        config.load_incluster_config()
        return client.CoreV1Api()
    except Exception:
        try:
            config.load_kube_config()
            return client.CoreV1Api()
        except Exception as e:
            logger.debug(f"Could not load Kubernetes configuration: {e}")
            return None

def poll_k8s(save_event_fn):
    global _last_known_restarts
    v1 = _init_k8s_client()
    if not v1:
        return

    try:
        pods = v1.list_namespaced_pod(namespace=NAMESPACE)
        for pod in pods.items:
            pod_name = pod.metadata.name
            app_label = pod.metadata.labels.get("app", pod_name)

            for cs in pod.status.container_statuses or []:
                container_name = cs.name
                restart_count = cs.restart_count
                prev_restarts = _last_known_restarts.get(pod_name, 0)

                # Check for termination reason (e.g. OOMKilled)
                terminated_reason = None
                if cs.last_state and cs.last_state.terminated:
                    terminated_reason = cs.last_state.terminated.reason

                # Check for waiting reason (e.g. CrashLoopBackOff)
                waiting_reason = None
                if cs.state and cs.state.waiting:
                    waiting_reason = cs.state.waiting.reason

                # Fire event if restarts increased OR waiting in CrashLoopBackOff
                if restart_count > prev_restarts and restart_count > 0:
                    _last_known_restarts[pod_name] = restart_count
                    sev = "critical" if (terminated_reason == "OOMKilled" or restart_count > 3) else "warning"
                    
                    logger.warning(
                        f"K8s pod restart detected on {pod_name} ({container_name}): "
                        f"restarts={restart_count}, last_term_reason={terminated_reason}"
                    )
                    save_event_fn({
                        "source": "k8s",
                        "service": app_label,
                        "severity": sev,
                        "data": {
                            "pod": pod_name,
                            "container": container_name,
                            "restart_count": restart_count,
                            "terminated_reason": terminated_reason,
                            "waiting_reason": waiting_reason
                        }
                    })
                elif waiting_reason == "CrashLoopBackOff" and pod_name not in _last_known_restarts:
                    _last_known_restarts[pod_name] = restart_count
                    logger.warning(f"K8s pod {pod_name} is in CrashLoopBackOff")
                    save_event_fn({
                        "source": "k8s",
                        "service": app_label,
                        "severity": "critical",
                        "data": {
                            "pod": pod_name,
                            "container": container_name,
                            "restart_count": restart_count,
                            "waiting_reason": "CrashLoopBackOff"
                        }
                    })

    except Exception as exc:
        logger.error(f"Error querying Kubernetes API for pods: {exc}", exc_info=True)
