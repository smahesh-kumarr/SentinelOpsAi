import os
import logging
from datetime import datetime, timedelta

from db import (
    get_unprocessed_events,
    mark_events_processed,
    get_active_incident,
    save_incident,
    update_incident_evidence,
)
from rules import ALL_RULES, normalize_service

logger = logging.getLogger("correlation.engine")

EVENT_WINDOW_SECONDS = int(os.environ.get("EVENT_WINDOW_SECONDS", 300))
INCIDENT_COOLDOWN_SECONDS = int(os.environ.get("INCIDENT_COOLDOWN_SECONDS", 600))

def run_correlation() -> dict:
    """
    Core correlation cycle:
    1. Reads unprocessed events within the event window.
    2. Groups events by canonical workload service.
    3. Evaluates rules from most-specific to general.
    4. Suppresses duplicates within the cooldown window (updating evidence).
    5. Saves new incidents to MongoDB.
    6. Marks processed events.
    """
    cutoff = (datetime.utcnow() - timedelta(seconds=EVENT_WINDOW_SECONDS)).isoformat()
    cooldown_cutoff = (datetime.utcnow() - timedelta(seconds=INCIDENT_COOLDOWN_SECONDS)).isoformat()

    unprocessed = get_unprocessed_events(cutoff_iso=cutoff)
    if not unprocessed:
        return {
            "status": "idle",
            "unprocessed_count": 0,
            "new_incidents_count": 0,
            "updated_incidents_count": 0,
            "new_incidents": [],
            "updated_incidents": []
        }

    logger.info(f"Running correlation on {len(unprocessed)} unprocessed raw telemetry events...")

    # Group events by normalized canonical service
    grouped_by_service: dict[str, list[dict]] = {}
    for event in unprocessed:
        raw_svc = event.get("service", "unknown")
        svc = normalize_service(raw_svc)
        grouped_by_service.setdefault(svc, []).append(event)

    new_incidents = []
    updated_incidents = []

    for service, events in grouped_by_service.items():
        logger.debug(f"Evaluating {len(events)} events for service '{service}'...")
        
        # Test rules in priority order (most specific first)
        for rule in ALL_RULES:
            match = rule(events)
            if match:
                incident_type = match["incident_type"]
                active = get_active_incident(service, incident_type, cooldown_cutoff)

                if active:
                    # Cooldown active: avoid alert storm duplicate, append evidence
                    logger.info(
                        f"Incident cooldown active for service '{service}' and type '{incident_type}'. "
                        f"Updating existing incident {active.get('id')} with new evidence."
                    )
                    update_incident_evidence(active.get("id"), match["evidence"])
                    updated_incidents.append({
                        "id": active.get("id"),
                        "service": service,
                        "incident_type": incident_type,
                        "title": active.get("title")
                    })
                else:
                    # Create brand new correlated incident
                    incident_payload = {
                        "service": service,
                        "title": match["title"],
                        "incident_type": incident_type,
                        "severity": match["severity"],
                        "description": match.get("description", ""),
                        "evidence": match["evidence"],
                        "status": "open",
                        "root_cause": None,
                        "confidence": None,
                        "recommendations": None,
                    }
                    saved = save_incident(incident_payload)
                    new_incidents.append({
                        "id": saved.get("id"),
                        "service": service,
                        "incident_type": incident_type,
                        "title": saved.get("title"),
                        "severity": saved.get("severity")
                    })
                
                # Stop checking remaining general rules for this service once a higher priority rule has matched
                break

    # Mark all evaluated events as processed
    event_ids = [str(e.get("id", e.get("_id", ""))) for e in unprocessed if e.get("id") or e.get("_id")]
    mark_events_processed(event_ids)

    logger.info(
        f"Correlation complete: {len(new_incidents)} created, "
        f"{len(updated_incidents)} updated under cooldown, "
        f"{len(event_ids)} events processed."
    )

    return {
        "status": "completed",
        "unprocessed_count": len(unprocessed),
        "new_incidents_count": len(new_incidents),
        "updated_incidents_count": len(updated_incidents),
        "new_incidents": new_incidents,
        "updated_incidents": updated_incidents
    }
