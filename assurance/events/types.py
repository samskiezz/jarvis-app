"""Event schema (pydantic v2, frozen → immutable payload)."""
from __future__ import annotations

import time
import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def _new_event_id() -> str:
    return f"evt-{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"


class Event(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    event_id: str = Field(default_factory=_new_event_id)
    name: str
    actor: str = "system"
    source: str = "unknown"
    correlation_id: str | None = None
    causation_id: str | None = None
    timestamp: float = Field(default_factory=lambda: time.time())
    payload: dict[str, Any] = Field(default_factory=dict)
