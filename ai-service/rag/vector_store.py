import os
import re
import math
import logging
from typing import List, Dict, Any

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, VectorParams, PointStruct
except ImportError:
    QdrantClient = None
    Distance = None
    VectorParams = None
    PointStruct = None

logger = logging.getLogger("ai_service.rag.vector_store")

QDRANT_URL = os.environ.get("QDRANT_URL", "http://qdrant.sentinelopsai.svc.cluster.local:6333")
COLLECTION_NAME = "runbooks"
VECTOR_DIM = 64

_qdrant_client = None
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
    global _qdrant_client, _is_qdrant_available
    if QdrantClient is not None:
        try:
            _qdrant_client = QdrantClient(url=QDRANT_URL, timeout=3.0)
            # Ping / test connection
            collections = _qdrant_client.get_collections().collections
            col_names = [c.name for c in collections]
            if COLLECTION_NAME not in col_names:
                _qdrant_client.create_collection(
                    collection_name=COLLECTION_NAME,
                    vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE)
                )
            _is_qdrant_available = True
            logger.info(f"Connected to Qdrant vector database at {QDRANT_URL}")
            return
        except Exception as e:
            _is_qdrant_available = False
            logger.warning(f"Qdrant vector store unreachable ({e}); using internal semantic index.")
    else:
        _is_qdrant_available = False

def is_qdrant_active() -> bool:
    return _is_qdrant_available

def store_chunk(doc_id: int, text: str, source: str) -> None:
    vec = _compute_sparse_vector(text)
    payload = {"text": text, "source": source}

    if _is_qdrant_available and _qdrant_client is not None:
        try:
            _qdrant_client.upsert(
                collection_name=COLLECTION_NAME,
                points=[PointStruct(id=doc_id, vector=vec, payload=payload)]
            )
            return
        except Exception as err:
            logger.error(f"Failed to upsert vector to Qdrant: {err}")

    # Fallback in-memory index
    _in_memory_docs.append({
        "id": doc_id,
        "vector": vec,
        "payload": payload
    })

def search_chunks(query_text: str, top_k: int = 3) -> List[Dict[str, Any]]:
    query_vec = _compute_sparse_vector(query_text)

    if _is_qdrant_available and _qdrant_client is not None:
        try:
            results = _qdrant_client.search(
                collection_name=COLLECTION_NAME,
                query_vector=query_vec,
                limit=top_k
            )
            return [
                {"score": r.score, "source": r.payload.get("source", ""), "text": r.payload.get("text", "")}
                for r in results
            ]
        except Exception as err:
            logger.error(f"Failed to search Qdrant vector store: {err}")

    # In-memory cosine search
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
