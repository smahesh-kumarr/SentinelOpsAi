import os
import logging
from datetime import datetime
try:
    from bson import ObjectId
    from pymongo import MongoClient
    from pymongo.errors import PyMongoError
except ImportError:
    ObjectId = None
    MongoClient = None
    PyMongoError = Exception

logger = logging.getLogger("correlation.db")

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://mongodb.sentinelopsai.svc.cluster.local:27017/sentinelops")
DB_NAME = os.environ.get("MONGODB_DB_NAME", "sentinelops")

_client = None
_db = None
_events_col = None
_incidents_col = None
_is_mongo_available = False

# Fallback in-memory stores
_in_memory_incidents = []
_in_memory_events = []

def init_db():
    global _client, _db, _events_col, _incidents_col, _is_mongo_available
    if MongoClient is None:
        _is_mongo_available = False
        logger.warning("pymongo/bson is not installed; operating in in-memory mode.")
        return
    try:
        _client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=3000,
            connectTimeoutMS=3000,
        )
        _client.admin.command("ping")
        _db = _client[DB_NAME]
        
        # Collections
        _events_col = _db["events"]
        _events_col.create_index([("processed", 1), ("timestamp", -1)])
        
        _incidents_col = _db["incidents"]
        _incidents_col.create_index([("created_at", -1)])
        _incidents_col.create_index([("service", 1), ("incident_type", 1), ("status", 1)])
        
        _is_mongo_available = True
        logger.info("Connected to MongoDB successfully for Correlation Engine", extra={"database": DB_NAME})
    except Exception as e:
        _is_mongo_available = False
        logger.warning(
            f"MongoDB unavailable ({e}); falling back to in-memory store for Correlation Engine.",
            extra={"error": str(e)}
        )

def is_connected() -> bool:
    return _is_mongo_available

def _format_doc(doc: dict) -> dict:
    d = dict(doc)
    if "_id" in d:
        d["id"] = str(d["_id"])
        d["_id"] = str(d["_id"])
    return d

def get_unprocessed_events(cutoff_iso: str = None) -> list[dict]:
    """Retrieve raw events where processed == False and timestamp >= cutoff."""
    if _is_mongo_available and _events_col is not None:
        try:
            query = {"processed": False}
            if cutoff_iso:
                query["timestamp"] = {"$gte": cutoff_iso}
            cursor = _events_col.find(query).sort("timestamp", 1)
            return [_format_doc(item) for item in cursor]
        except PyMongoError as err:
            logger.error(f"Failed to query unprocessed events from MongoDB: {err}")

    # Fallback in-memory
    results = [e for e in _in_memory_events if not e.get("processed", False)]
    if cutoff_iso:
        results = [e for e in results if e.get("timestamp", "") >= cutoff_iso]
    return results

def mark_events_processed(event_ids: list[str]):
    """Mark the given events as processed so they aren't correlated again."""
    if not event_ids:
        return
    if _is_mongo_available and _events_col is not None:
        try:
            obj_ids = []
            str_ids = []
            for eid in event_ids:
                try:
                    obj_ids.append(ObjectId(eid))
                except Exception:
                    str_ids.append(eid)
            
            filter_query = {"$or": []}
            if obj_ids:
                filter_query["$or"].append({"_id": {"$in": obj_ids}})
            if str_ids:
                filter_query["$or"].append({"id": {"$in": str_ids}})

            if filter_query["$or"]:
                _events_col.update_many(filter_query, {"$set": {"processed": True}})
                logger.info(f"Marked {len(event_ids)} events as processed in MongoDB")
                return
        except PyMongoError as err:
            logger.error(f"Failed to update processed status in MongoDB: {err}")

    # Fallback in-memory
    id_set = set(event_ids)
    for e in _in_memory_events:
        if e.get("id") in id_set or e.get("_id") in id_set:
            e["processed"] = True

def get_active_incident(service: str, incident_type: str, cooldown_cutoff_iso: str) -> dict | None:
    """Find an open incident of the same type for the service within the cooldown window."""
    if _is_mongo_available and _incidents_col is not None:
        try:
            query = {
                "service": service,
                "incident_type": incident_type,
                "status": "open",
                "created_at": {"$gte": cooldown_cutoff_iso}
            }
            doc = _incidents_col.find_one(query, sort=[("created_at", -1)])
            if doc:
                return _format_doc(doc)
            return None
        except PyMongoError as err:
            logger.error(f"Failed to query active incident from MongoDB: {err}")

    # Fallback in-memory
    for inc in reversed(_in_memory_incidents):
        if (inc.get("service") == service and 
            inc.get("incident_type") == incident_type and 
            inc.get("status") == "open" and 
            inc.get("created_at", "") >= cooldown_cutoff_iso):
            return inc
    return None

def save_incident(incident_dict: dict) -> dict:
    """Save a newly generated correlated incident."""
    doc = dict(incident_dict)
    now_iso = datetime.utcnow().isoformat()
    if "created_at" not in doc or not doc["created_at"]:
        doc["created_at"] = now_iso
    doc["updated_at"] = now_iso
    if "status" not in doc:
        doc["status"] = "open"

    if _is_mongo_available and _incidents_col is not None:
        try:
            res = _incidents_col.insert_one(doc)
            doc["id"] = str(res.inserted_id)
            doc["_id"] = str(res.inserted_id)
            logger.info(f"Saved new incident '{doc.get('title')}' (ID: {doc['id']}) in MongoDB")
            return doc
        except PyMongoError as err:
            logger.error(f"Failed to write incident to MongoDB: {err}")

    # Fallback in-memory
    doc["id"] = f"inc-{len(_in_memory_incidents) + 1}"
    doc["_id"] = doc["id"]
    _in_memory_incidents.append(doc)
    return doc

def update_incident_evidence(incident_id: str, new_evidence: list[dict]) -> bool:
    """Append new evidence to an existing active incident during cooldown."""
    if not new_evidence:
        return True
    now_iso = datetime.utcnow().isoformat()
    if _is_mongo_available and _incidents_col is not None:
        try:
            target_filter = None
            try:
                target_filter = {"_id": ObjectId(incident_id)}
            except Exception:
                target_filter = {"id": incident_id}

            _incidents_col.update_one(
                target_filter,
                {
                    "$push": {"evidence": {"$each": new_evidence}},
                    "$set": {"updated_at": now_iso}
                }
            )
            logger.info(f"Appended {len(new_evidence)} evidence items to incident {incident_id}")
            return True
        except PyMongoError as err:
            logger.error(f"Failed to append evidence to incident {incident_id}: {err}")

    # Fallback in-memory
    for inc in _in_memory_incidents:
        if inc.get("id") == incident_id or inc.get("_id") == incident_id:
            inc.setdefault("evidence", []).extend(new_evidence)
            inc["updated_at"] = now_iso
            return True
    return False

def get_incidents(
    status: str = None,
    service: str = None,
    incident_type: str = None,
    limit: int = 50
) -> list[dict]:
    """Retrieve incidents with optional filtering."""
    if _is_mongo_available and _incidents_col is not None:
        try:
            query = {}
            if status:
                query["status"] = status
            if service:
                query["service"] = service
            if incident_type:
                query["incident_type"] = incident_type
            cursor = _incidents_col.find(query).sort("created_at", -1).limit(limit)
            return [_format_doc(item) for item in cursor]
        except PyMongoError as err:
            logger.error(f"Failed to list incidents from MongoDB: {err}")

    # Fallback in-memory
    filtered = list(reversed(_in_memory_incidents))
    if status:
        filtered = [i for i in filtered if i.get("status") == status]
    if service:
        filtered = [i for i in filtered if i.get("service") == service]
    if incident_type:
        filtered = [i for i in filtered if i.get("incident_type") == incident_type]
    return filtered[:limit]

def get_incident_by_id(incident_id: str) -> dict | None:
    """Retrieve a single incident by ID."""
    if _is_mongo_available and _incidents_col is not None:
        try:
            target_filter = None
            try:
                target_filter = {"_id": ObjectId(incident_id)}
            except Exception:
                target_filter = {"id": incident_id}
            doc = _incidents_col.find_one(target_filter)
            if doc:
                return _format_doc(doc)
            return None
        except PyMongoError as err:
            logger.error(f"Failed to find incident {incident_id}: {err}")

    # Fallback in-memory
    for inc in _in_memory_incidents:
        if inc.get("id") == incident_id or inc.get("_id") == incident_id:
            return inc
    return None

def update_incident_status(incident_id: str, status: str) -> bool:
    """Update incident status (e.g. open -> in_progress -> resolved)."""
    now_iso = datetime.utcnow().isoformat()
    if _is_mongo_available and _incidents_col is not None:
        try:
            target_filter = None
            try:
                target_filter = {"_id": ObjectId(incident_id)}
            except Exception:
                target_filter = {"id": incident_id}
            res = _incidents_col.update_one(
                target_filter,
                {"$set": {"status": status, "updated_at": now_iso}}
            )
            return res.modified_count > 0
        except PyMongoError as err:
            logger.error(f"Failed to update incident status in MongoDB: {err}")

    # Fallback in-memory
    for inc in _in_memory_incidents:
        if inc.get("id") == incident_id or inc.get("_id") == incident_id:
            inc["status"] = status
            inc["updated_at"] = now_iso
            return True
    return False

def get_summary() -> dict:
    """Return aggregated incident statistics for dashboard and health status."""
    incidents = get_incidents(limit=500)
    total = len(incidents)
    open_count = sum(1 for i in incidents if i.get("status") == "open")
    resolved_count = sum(1 for i in incidents if i.get("status") == "resolved")
    
    by_severity = {}
    by_type = {}
    for inc in incidents:
        sev = inc.get("severity", "unknown")
        itype = inc.get("incident_type", "unknown")
        by_severity[sev] = by_severity.get(sev, 0) + 1
        by_type[itype] = by_type.get(itype, 0) + 1

    return {
        "total_incidents": total,
        "open_incidents": open_count,
        "resolved_incidents": resolved_count,
        "by_severity": by_severity,
        "by_type": by_type
    }
