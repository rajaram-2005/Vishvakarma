# SUTRA service API — request schemas (module-level so PEP 563 annotations resolve).
from typing import Optional

from pydantic import BaseModel, Field


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    priority: str = "p1"
    category: str = "Core"
    tags: list[str] = []
    due: Optional[str] = None
    assignee: dict = Field(default_factory=lambda: {"kind": "human", "id": "human", "name": "You"})
