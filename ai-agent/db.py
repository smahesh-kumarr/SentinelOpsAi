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

logger = logging.getLogger("ai_agent.db")

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://mongodb.sentinelopsai.svc.cluster.local:27017/sentinelops")
DB_NAME = os.environ.get("MONGODB_DB_NAME", "sentinelops")

_client = None
_db = None
_incidents_col = None
_audit_col = None
_is_mongo_available = False

_in_memory_incidents = []
_in_memory_audit = []

def init_db():
    global _client, _db, _incidents_col, _audit_col, _is_mongo_available
    if MongoClient is None:
        _is_mongo_available = False
        logger.warning("pymongo is not installed; operating in in-memory mode.")
        return
    try:
        _client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=3000,
            connectTimeoutMS=3000,
        )
        _client.admin.command("ping")
        _db = _client[DB_NAME]
        _incidents_col = _db["incidents"]
        _audit_col = _db["remediation_audit"]
        _audit_col.create_index([("timestamp", -1)])
        _is_mongo_available = True
        logger.info("Connected to MongoDB successfully for Remediation AI Agent", extra={"database": DB_NAME})
    except Exception as e:
        _is_mongo_available = False
        logger.warning(
            f"MongoDB unavailable ({e}); falling back to in-memory store for Remediation Agent.",
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

def get_pending_remediations(limit: int = 10) -> list:
    """Retrieve analyzed incidents with actions awaiting execution or approval."""
    if _is_mongo_available and _incidents_col is not None:
        try:
            query = {
                "status": "analyzed",
                "recommendations": {"$exists": True, "$ne": []}
            }
            cursor = _incidents_col.find(query).sort("created_at", 1).limit(limit)
            return [_format_doc(item) for item in cursor]
        except PyMongoError as err:
            logger.error(f"Failed to fetch pending remediations from MongoDB: {err}")

    # Fallback in-memory
    return [i for i in _in_memory_incidents if i.get("status") == "analyzed"][:limit]

def get_incident_by_id(incident_id: str) -> dict | None:
    if _is_mongo_available and _incidents_col is not None:
        try:
            target_filter = None
            if ObjectId is not None:
                try:
                    target_filter = {"_id": ObjectId(incident_id)}
                except Exception:
                    target_filter = {"id": incident_id}
            else:
                target_filter = {"id": incident_id}
            doc = _incidents_col.find_one(target_filter)
            if doc:
                return _format_doc(doc)
            return None
        except PyMongoError as err:
            logger.error(f"Failed to fetch incident {incident_id}: {err}")

    for inc in _in_memory_incidents:
        if inc.get("id") == incident_id or inc.get("_id") == incident_id:
            return inc
    return None

def update_incident_status(incident_id: str, status: str, extra_fields: dict = None) -> bool:
    """Update overall incident status (e.g. analyzed -> in_remediation -> resolved)."""
    now_iso = datetime.utcnow().isoformat()
    update_data = {"status": status, "updated_at": now_iso}
    if extra_fields:
        update_data.update(extra_fields)

    if _is_mongo_available and _incidents_col is not None:
        try:
            target_filter = None
            if ObjectId is not None:
                try:
                    target_filter = {"_id": ObjectId(incident_id)}
                except Exception:
                    target_filter = {"id": incident_id}
            else:
                target_filter = {"id": incident_id}

            res = _incidents_col.update_one(target_filter, {"$set": update_data})
            return res.modified_count > 0
        except PyMongoError as err:
            logger.error(f"Failed to update incident status in MongoDB: {err}")

    # Fallback in-memory
    for inc in _in_memory_incidents:
        if inc.get("id") == incident_id or inc.get("_id") == incident_id:
            inc.update(update_data)
            return True
    return False

def update_recommendation_status(
    incident_id: str,
    action_index: int,
    new_status: str,
    execution_log: dict = None
) -> bool:
    """Update the execution status of a specific recommendation item."""
    inc = get_incident_by_id(incident_id)
    if not inc:
        return False

    recs = inc.get("recommendations", [])
    if action_index < 0 or action_index >= len(recs):
        return False

    recs[action_index]["status"] = new_status
    recs[action_index]["executed_at"] = datetime.utcnow().isoformat()
    if execution_log:
        recs[action_index]["execution_result"] = execution_log

    return update_incident_status(incident_id, inc.get("status"), {"recommendations": recs})

def log_audit(audit_entry: dict):
    """Log an immutable audit trail entry for every remediation executed or rejected."""
    doc = dict(audit_entry)
    if "timestamp" not in doc:
        doc["timestamp"] = datetime.utcnow().isoformat()

    if _is_mongo_available and _audit_col is not None:
        try:
            _audit_col.insert_one(doc)
            return
        except PyMongoError as err:
            logger.error(f"Failed to write audit log to MongoDB: {err}")

    _in_memory_audit.append(doc)

def get_audit_history(limit: int = 50) -> list:
    """Retrieve audit history entries."""
    if _is_mongo_available and _audit_col is not None:
        try:
            cursor = _audit_col.find({}).sort("timestamp", -1).limit(limit)
            return [_format_doc(item) for item in cursor]
        except PyMongoError as err:
            logger.error(f"Failed to retrieve audit history from MongoDB: {err}")

    return list(reversed(_in_memory_audit))[:limit]
