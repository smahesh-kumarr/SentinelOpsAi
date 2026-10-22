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

logger = logging.getLogger("ai_service.db")

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://mongodb.sentinelopsai.svc.cluster.local:27017/sentinelops")
DB_NAME = os.environ.get("MONGODB_DB_NAME", "sentinelops")

_client = None
_db = None
_incidents_col = None
_is_mongo_available = False

_in_memory_incidents = []

def init_db():
    global _client, _db, _incidents_col, _is_mongo_available
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
        _incidents_col.create_index([("created_at", -1)])
        _incidents_col.create_index([("root_cause", 1)])
        _is_mongo_available = True
        logger.info("Connected to MongoDB successfully for AI Service", extra={"database": DB_NAME})
    except Exception as e:
        _is_mongo_available = False
        logger.warning(
            f"MongoDB unavailable ({e}); falling back to in-memory store for AI Service.",
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

def get_unanalyzed_incidents(limit: int = 10) -> list[dict]:
    """Retrieve open incidents where root_cause is not yet determined."""
    if _is_mongo_available and _incidents_col is not None:
        try:
            query = {
                "$or": [
                    {"root_cause": None},
                    {"root_cause": {"$exists": False}},
                    {"status": "open"}
                ]
            }
            cursor = _incidents_col.find(query).sort("created_at", -1).limit(limit)
            return [_format_doc(item) for item in cursor]
        except PyMongoError as err:
            logger.error(f"Failed to query unanalyzed incidents from MongoDB: {err}")

    # Fallback in-memory
    results = [i for i in _in_memory_incidents if not i.get("root_cause")]
    return results[:limit]

def update_incident_analysis(
    incident_id: str,
    root_cause: str,
    confidence: float,
    recommendations: list
) -> bool:
    """Save AI analysis, confidence score, and policy-governed recommendations."""
    now_iso = datetime.utcnow().isoformat()
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

            res = _incidents_col.update_one(
                target_filter,
                {
                    "$set": {
                        "root_cause": root_cause,
                        "confidence": confidence,
                        "recommendations": recommendations,
                        "status": "analyzed",
                        "analyzed_at": now_iso,
                        "updated_at": now_iso
                    }
                }
            )
            return res.modified_count > 0
        except PyMongoError as err:
            logger.error(f"Failed to update incident analysis in MongoDB: {err}")

    # Fallback in-memory
    for inc in _in_memory_incidents:
        if inc.get("id") == incident_id or inc.get("_id") == incident_id:
            inc["root_cause"] = root_cause
            inc["confidence"] = confidence
            inc["recommendations"] = recommendations
            inc["status"] = "analyzed"
            inc["analyzed_at"] = now_iso
            inc["updated_at"] = now_iso
            return True
    return False

def get_incidents(status: str = None, limit: int = 50) -> list[dict]:
    """Retrieve incidents for verification and API endpoints."""
    if _is_mongo_available and _incidents_col is not None:
        try:
            query = {}
            if status:
                query["status"] = status
            cursor = _incidents_col.find(query).sort("created_at", -1).limit(limit)
            return [_format_doc(item) for item in cursor]
        except PyMongoError as err:
            logger.error(f"Failed to retrieve incidents from MongoDB: {err}")

    filtered = _in_memory_incidents
    if status:
        filtered = [i for i in filtered if i.get("status") == status]
    return list(reversed(filtered))[:limit]

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
