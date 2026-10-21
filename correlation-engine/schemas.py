from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class IncidentStatusUpdate(BaseModel):
    status: str = Field(..., description="New incident status: 'open', 'in_progress', 'resolved', 'closed'")

class IncidentOut(BaseModel):
    id: str
    title: str
    service: str
    severity: str
    incident_type: str
    description: Optional[str] = None
    evidence: List[Dict[str, Any]] = []
    status: str = "open"
    root_cause: Optional[str] = None
    confidence: Optional[float] = None
    recommendations: Optional[Any] = None
    created_at: str
    updated_at: Optional[str] = None
