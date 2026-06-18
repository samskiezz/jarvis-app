"""AuditEntry schema (pydantic v2)."""
from __future__ import annotations

import time
import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def _new_audit_id() -> str:
    return f"aud-{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"


class AuditEntry(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    audit_id: str = Field(default_factory=_new_audit_id)
    timestamp: float = Field(default_factory=lambda: time.time())
    actor: str = "system"
    action: str
    resource: str = ""
    outcome: str = "ok"  # "ok" | "failure" | "dangerous" | "approval_required" | ...
    correlation_id: str | None = None
    detail: dict[str, Any] = Field(default_factory=dict)
