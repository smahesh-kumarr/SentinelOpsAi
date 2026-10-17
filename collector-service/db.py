import os
import logging
from datetime import datetime
from pymongo import MongoClient
from pymongo.errors import PyMongoError

logger = logging.getLogger("collector.db")

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://mongodb.sentinelopsai.svc.cluster.local:27017/sentinelops")
DB_NAME = os.environ.get("MONGODB_DB_NAME", "sentinelops")

_client = None
_db = None
_events_col = None
_is_mongo_available = False
_in_memory_events = []

def init_db():
    global _client, _db, _events_col, _is_mongo_available
    try:
        _client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=3000,
            connectTimeoutMS=3000,
        )
        _client.admin.command("ping")
        _db = _client[DB_NAME]
        _events_col = _db["events"]
        _events_col.create_index([("timestamp", -1)])
        _events_col.create_index([("processed", 1)])
        _is_mongo_available = True
        logger.info("Connected to MongoDB event store successfully", extra={"database": DB_NAME})
    except Exception as e:
        _is_mongo_available = False
        logger.warning(
            f"MongoDB unavailable ({e}); falling back to in-memory event store.",
            extra={"error": str(e)}
        )

def is_connected() -> bool:
    return _is_mongo_available

def save_event(event_dict: dict) -> dict:
    doc = dict(event_dict)
    if "timestamp" not in doc or not doc["timestamp"]:
        doc["timestamp"] = datetime.utcnow().isoformat()
    if "processed" not in doc:
        doc["processed"] = False

    if _is_mongo_available and _events_col is not None:
        try:
            res = _events_col.insert_one(doc)
            doc["id"] = str(res.inserted_id)
            doc["_id"] = str(res.inserted_id)
            return doc
        except PyMongoError as err:
            logger.error(f"Failed to write event to MongoDB: {err}", extra={"error": str(err)})

    # Fallback in-memory store
    doc["id"] = str(len(_in_memory_events) + 1)
    _in_memory_events.append(doc)
    return doc

def get_events(processed: bool | None = None, limit: int = 100) -> list:
    if _is_mongo_available and _events_col is not None:
        try:
            query = {}
            if processed is not None:
                query["processed"] = processed
            cursor = _events_col.find(query).sort("timestamp", -1).limit(limit)
            results = []
            for item in cursor:
                item["id"] = str(item.get("_id", ""))
                item["_id"] = str(item.get("_id", ""))
                results.append(item)
            return results
        except PyMongoError as err:
            logger.error(f"Failed to read events from MongoDB: {err}", extra={"error": str(err)})

    # Fallback in-memory
    filtered = _in_memory_events
    if processed is not None:
        filtered = [e for e in _in_memory_events if e.get("processed") == processed]
    return list(reversed(filtered))[:limit]
