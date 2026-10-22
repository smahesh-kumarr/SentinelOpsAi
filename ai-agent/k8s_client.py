import logging
from datetime import datetime
from kubernetes import client, config
from kubernetes.client.rest import ApiException

logger = logging.getLogger("ai_agent.k8s")

_k8s_initialized = False
_apps_v1 = None
_core_v1 = None
_networking_v1 = None

def init_k8s():
    global _k8s_initialized, _apps_v1, _core_v1, _networking_v1
    try:
        config.load_incluster_config()
        _apps_v1 = client.AppsV1Api()
        _core_v1 = client.CoreV1Api()
        _networking_v1 = client.NetworkingV1Api()
        _k8s_initialized = True
        logger.info("Loaded in-cluster Kubernetes configuration successfully")
        return
    except Exception:
        try:
            config.load_kube_config()
            _apps_v1 = client.AppsV1Api()
            _core_v1 = client.CoreV1Api()
            _networking_v1 = client.NetworkingV1Api()
            _k8s_initialized = True
            logger.info("Loaded local kube-config successfully")
            return
        except Exception as e:
            _k8s_initialized = False
            logger.warning(f"Failed to load Kubernetes configuration ({e}); operating in simulated mode.")

def is_k8s_connected() -> bool:
    return _k8s_initialized

def restart_deployment(service: str, namespace: str = "sentinelopsai") -> dict:
    """Perform rolling restart by updating restart annotation (equivalent to kubectl rollout restart)."""
    if not _k8s_initialized or _apps_v1 is None:
        logger.info(f"[SIMULATED] Rolling restart executed for deployment/{service} in namespace '{namespace}'")
        return {"status": "simulated", "action": "restart_deployment", "service": service}

    now_iso = datetime.utcnow().isoformat() + "Z"
    body = {
        "spec": {
            "template": {
                "metadata": {
                    "annotations": {
                        "kubectl.kubernetes.io/restartedAt": now_iso
                    }
                }
            }
        }
    }
    try:
        res = _apps_v1.patch_namespaced_deployment(name=service, namespace=namespace, body=body)
        logger.info(f"Successfully triggered rolling restart for deployment/{service} in namespace '{namespace}'")
        return {
            "status": "success",
            "action": "restart_deployment",
            "service": service,
            "restartedAt": now_iso,
            "observed_generation": res.status.observed_generation
        }
    except ApiException as e:
        logger.error(f"Kubernetes API error restarting deployment/{service}: {e}")
        raise RuntimeError(f"K8s restart failed: {e.reason}")

def scale_deployment(service: str, replicas: int = 2, namespace: str = "sentinelopsai") -> dict:
    """Scale deployment replicas."""
    if not _k8s_initialized or _apps_v1 is None:
        logger.info(f"[SIMULATED] Scaled deployment/{service} to {replicas} replicas in '{namespace}'")
        return {"status": "simulated", "action": "scale_deployment", "service": service, "replicas": replicas}

    body = {"spec": {"replicas": replicas}}
    try:
        res = _apps_v1.patch_namespaced_deployment(name=service, namespace=namespace, body=body)
        logger.info(f"Successfully scaled deployment/{service} to {replicas} replicas")
        return {
            "status": "success",
            "action": "scale_deployment",
            "service": service,
            "replicas": replicas
        }
    except ApiException as e:
        logger.error(f"Kubernetes API error scaling deployment/{service}: {e}")
        raise RuntimeError(f"K8s scaling failed: {e.reason}")

def isolate_workload(service: str, namespace: str = "sentinelopsai") -> dict:
    """Apply zero-trust quarantine NetworkPolicy to cut off compromised workload from cluster network."""
    policy_name = f"quarantine-{service}"
    if not _k8s_initialized or _networking_v1 is None:
        logger.info(f"[SIMULATED] Applied quarantine NetworkPolicy '{policy_name}' to '{service}'")
        return {"status": "simulated", "action": "isolate_pod", "policy": policy_name}

    policy_body = client.V1NetworkPolicy(
        metadata=client.V1ObjectMeta(name=policy_name, namespace=namespace),
        spec=client.V1NetworkPolicySpec(
            pod_selector=client.V1LabelSelector(match_labels={"app": service}),
            policy_types=["Ingress", "Egress"],
            ingress=[], # Deny all ingress
            egress=[]   # Deny all egress
        )
    )
    try:
        _networking_v1.create_namespaced_network_policy(namespace=namespace, body=policy_body)
        logger.warning(f"Zero-trust quarantine NetworkPolicy '{policy_name}' successfully applied!")
        return {"status": "success", "action": "isolate_pod", "policy": policy_name}
    except ApiException as e:
        if e.status == 409: # Already exists
            logger.info(f"Quarantine policy '{policy_name}' already exists.")
            return {"status": "already_isolated", "policy": policy_name}
        logger.error(f"Kubernetes API error creating NetworkPolicy '{policy_name}': {e}")
        raise RuntimeError(f"K8s isolation failed: {e.reason}")

def check_deployment_ready(service: str, namespace: str = "sentinelopsai") -> dict:
    """Query current deployment replica rollout status."""
    if not _k8s_initialized or _apps_v1 is None:
        return {"is_ready": True, "ready_replicas": 1, "desired_replicas": 1, "unavailable_replicas": 0}

    try:
        dep = _apps_v1.read_namespaced_deployment(name=service, namespace=namespace)
        replicas = dep.spec.replicas or 1
        ready = dep.status.ready_replicas or 0
        unavailable = dep.status.unavailable_replicas or 0
        updated = dep.status.updated_replicas or 0

        is_ready = (ready == replicas) and (unavailable == 0) and (updated == replicas)
        return {
            "is_ready": is_ready,
            "ready_replicas": ready,
            "desired_replicas": replicas,
            "unavailable_replicas": unavailable,
            "updated_replicas": updated
        }
    except ApiException as e:
        logger.error(f"Kubernetes API error checking deployment/{service}: {e}")
        return {"is_ready": False, "error": str(e.reason)}
