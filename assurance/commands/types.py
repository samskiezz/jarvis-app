"""Command + result schemas (pydantic v2).

Inspired by NASA fprime (Fw/Cmd) — every command carries the IDs needed to
correlate across the system. correlation_id chains commands+events emitted by
their handlers; causation_id points at the parent command.
"""
from __future__ import annotations

import time
import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def _new_id(prefix: str) -> str:
    return f"{prefix}-{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"


class Command(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    command_id: str = Field(default_factory=lambda: _new_id("cmd"))
    name: str
    actor: str = "system"
    payload: dict[str, Any] = Field(default_factory=dict)
    correlation_id: str = Field(default_factory=lambda: _new_id("corr"))
    causation_id: str | None = None
    timestamp: float = Field(default_factory=lambda: time.time())
    dry_run: bool = False
    approved: bool = False
    idempotency_key: str | None = None


class CommandResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: Literal[True] = True
    command_id: str
    name: str
    actor: str
    correlation_id: str
    started_at: float
    finished_at: float
    duration_ms: float
    dry_run: bool
    approved: bool = False
    payload_out: dict[str, Any] = Field(default_factory=dict)


class CommandFailure(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: Literal[False] = False
    command_id: str
    name: str
    actor: str
    correlation_id: str
    started_at: float
    finished_at: float
    duration_ms: float
    dry_run: bool
    approved: bool = False
    error_kind: str
    error_message: str
    payload_out: dict[str, Any] = Field(default_factory=dict)


CommandOutcome = CommandResult | CommandFailure
