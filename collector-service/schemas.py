from pydantic import BaseModel
from typing import Optional

class EventIn(BaseModel):
    source: str
    service: str
    severity: Optional[str] = None
    data: dict
