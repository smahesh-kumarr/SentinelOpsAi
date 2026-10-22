import logging
from db import get_unanalyzed_incidents, update_incident_analysis
from rag.retriever import retrieve_context
from llm.client import analyze_incident
from policy.enrich import enrich_recommendations

logger = logging.getLogger("ai_service.analyzer")

async def run_analysis() -> dict:
    """
    Core AI & RAG analysis cycle:
    1. Fetches unanalyzed incidents from MongoDB.
    2. Retrieves top-K grounding runbook chunks from vector store.
    3. Synthesizes root-cause diagnosis and confidence score.
    4. Enriches recommendations with policy guardrails & kubectl commands.
    5. Updates MongoDB incident status to 'analyzed'.
    """
    unanalyzed = get_unanalyzed_incidents(limit=10)
    if not unanalyzed:
        return {
            "status": "idle",
            "unanalyzed_count": 0,
            "analyzed_count": 0,
            "incidents": []
        }

    logger.info(f"Running AI Root Cause Analysis on {len(unanalyzed)} unanalyzed incidents...")
    analyzed_results = []

    for inc in unanalyzed:
        inc_id = inc.get("id", inc.get("_id"))
        title = inc.get("title", "Unknown Incident")
        service = inc.get("service", "backend")
        incident_type = inc.get("incident_type", "unknown")
        severity = inc.get("severity", "critical")
        evidence = inc.get("evidence", [])
        desc = inc.get("description", "")

        # 1. Retrieve RAG grounding context from vector store
        query = f"{title} {incident_type} {desc}"
        context = retrieve_context(query, top_k=3)

        # 2. Invoke AI Reasoning Engine
        try:
            analysis = await analyze_incident(
                incident_title=title,
                service=service,
                incident_type=incident_type,
                severity=severity,
                evidence=evidence,
                context=context
            )
            root_cause = analysis.get("root_cause", "Root cause undetermined.")
            confidence = float(analysis.get("confidence", 85.0))
            raw_recs = analysis.get("recommendations", [])

            # 3. Apply Policy Guardrails & Action Enrichment
            enriched_recs = enrich_recommendations(raw_recs, service, confidence)

            # 4. Save to MongoDB
            update_incident_analysis(inc_id, root_cause, confidence, enriched_recs)

            analyzed_results.append({
                "id": str(inc_id),
                "title": title,
                "service": service,
                "incident_type": incident_type,
                "confidence": confidence,
                "root_cause": root_cause,
                "recommendations_count": len(enriched_recs),
                "auto_approved_actions": [r["action_key"] for r in enriched_recs if r["status"] == "auto_approved"]
            })
            logger.info(f"Successfully analyzed incident '{title}' (ID: {inc_id}) with confidence {confidence}%.")

        except Exception as e:
            logger.error(f"Failed to analyze incident {inc_id}: {e}", exc_info=True)

    return {
        "status": "completed",
        "unanalyzed_count": len(unanalyzed),
        "analyzed_count": len(analyzed_results),
        "incidents": analyzed_results
    }
