import os
import re
import math
import logging
import httpx
from typing import List, Dict, Any

logger = logging.getLogger("ai_service.rag.vector_store")

QDRANT_URL = os.environ.get("QDRANT_URL", "http://qdrant.sentinelopsai.svc.cluster.local:6333")
COLLECTION_NAME = "runbooks"
VECTOR_DIM = 64

_is_qdrant_available = False
_in_memory_docs: List[Dict[str, Any]] = []

def _tokenize(text: str) -> List[str]:
    return [w for w in re.findall(r'[a-zA-Z0-9_\-]+', text.lower()) if len(w) > 2]

def _compute_sparse_vector(text: str, dim: int = VECTOR_DIM) -> List[float]:
    """Lightweight hash-based term frequency embedding vector."""
    tokens = _tokenize(text)
    vec = [0.0] * dim
    if not tokens:
        return vec
    for t in tokens:
        idx = hash(t) % dim
        vec[idx] += 1.0
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [x / norm for x in vec]
    return vec

def _cosine_similarity(v1: List[float], v2: List[float]) -> float:
    return sum(a * b for a, b in zip(v1, v2))

def init_vector_store():
    global _is_qdrant_available
    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(f"{QDRANT_URL}/collections/{COLLECTION_NAME}")
            if resp.status_code == 404:
                create_resp = client.put(
                    f"{QDRANT_URL}/collections/{COLLECTION_NAME}",
                    json={"vectors": {"size": VECTOR_DIM, "distance": "Cosine"}}
                )
                if create_resp.status_code in [200, 201]:
                    _is_qdrant_available = True
                    logger.info(f"Created collection '{COLLECTION_NAME}' in Qdrant at {QDRANT_URL}")
                    return
            elif resp.status_code == 200:
                _is_qdrant_available = True
                logger.info(f"Connected to Qdrant vector database collection '{COLLECTION_NAME}' at {QDRANT_URL}")
                return
    except Exception as e:
        logger.warning(f"Qdrant vector store unreachable ({e}); using internal semantic index.")
    
    _is_qdrant_available = False

def is_qdrant_active() -> bool:
    return _is_qdrant_available

def store_chunk(doc_id: int, text: str, source: str) -> None:
    vec = _compute_sparse_vector(text)
    payload = {"text": text, "source": source}

    if _is_qdrant_available:
        try:
            with httpx.Client(timeout=3.0) as client:
                body = {
                    "points": [
                        {
                            "id": doc_id,
                            "vector": vec,
                            "payload": payload
                        }
                    ]
                }
                res = client.put(f"{QDRANT_URL}/collections/{COLLECTION_NAME}/points?wait=true", json=body)
                if res.status_code in [200, 201]:
                    return
        except Exception as err:
            logger.error(f"Failed to upsert vector to Qdrant REST API: {err}")

    # Fallback in-memory index
    _in_memory_docs.append({
        "id": doc_id,
        "vector": vec,
        "payload": payload
    })

def search_chunks(query_text: str, top_k: int = 3) -> List[Dict[str, Any]]:
    query_vec = _compute_sparse_vector(query_text)

    if _is_qdrant_available:
        try:
            with httpx.Client(timeout=3.0) as client:
                search_body = {
                    "vector": query_vec,
                    "limit": top_k,
                    "with_payload": True
                }
                res = client.post(f"{QDRANT_URL}/collections/{COLLECTION_NAME}/points/search", json=search_body)
                if res.status_code == 200:
                    hits = res.json().get("result", [])
                    return [
                        {
                            "score": float(h.get("score", 0.0)),
                            "source": h.get("payload", {}).get("source", ""),
                            "text": h.get("payload", {}).get("text", "")
                        }
                        for h in hits
                    ]
        except Exception as err:
            logger.error(f"Failed to search Qdrant via REST API: {err}")

    # Fallback in-memory cosine search
    scored = []
    for doc in _in_memory_docs:
        sim = _cosine_similarity(query_vec, doc["vector"])
        scored.append({
            "score": sim,
            "source": doc["payload"].get("source", ""),
            "text": doc["payload"].get("text", "")
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]
