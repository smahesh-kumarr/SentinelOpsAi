import logging
from rag.vector_store import search_chunks

logger = logging.getLogger("ai_service.rag.retriever")

def retrieve_context(query_text: str, top_k: int = 3) -> str:
    """Retrieve top-K grounding runbook chunks for a given incident query."""
    hits = search_chunks(query_text, top_k=top_k)
    if not hits:
        return "No specific runbook found in knowledge base."

    formatted_context = "\n\n".join(
        f"[{h['source']} | Relevance: {h['score']:.2f}]\n{h['text']}"
        for h in hits
    )
    logger.debug(f"Retrieved {len(hits)} grounding context chunks for query: '{query_text[:50]}...'")
    return formatted_context
