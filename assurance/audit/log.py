"""Append-only audit log.

Sinks to JSONL at server/data/assurance/audit.jsonl. Every payload runs through
the redactor first.

Inspired by NASA cFS Event Services + standard sysaudit semantics.
"""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Any

from ..events.types import Event
from .redact import redact_value
from .types import AuditEntry

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "server", "data", "assurance")
os.makedirs(DATA_DIR, exist_ok=True)
AUDIT_FILE = os.path.join(DATA_DIR, "audit.jsonl")

_LOCK = threading.RLock()
_MAX_INLINE = 1024


def _write_line(entry: AuditEntry) -> None:
    safe = redact_value(entry.model_dump())
    line = json.dumps(safe, separators=(",", ":"), ensure_ascii=True)
    if len(line) > 256 * 1024:
        line = json.dumps({**safe, "detail": {"_truncated": True}}, separators=(",", ":"))
    with _LOCK:
        try:
            with open(AUDIT_FILE, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except OSError:
            # Silent on disk failure — audit logging must never crash callers.
            pass


def append_audit(action: str, *, actor: str = "system", resource: str = "",
                 outcome: str = "ok", correlation_id: str | None = None,
                 detail: dict[str, Any] | None = None) -> AuditEntry:
    entry = AuditEntry(
        action=action,
        actor=actor,
        resource=resource,
        outcome=outcome,
        correlation_id=correlation_id,
        detail=detail or {},
    )
    _write_line(entry)
    return entry


def append_command_outcome(outcome) -> None:  # noqa: ANN001
    """CommandBus audit hook.

    outcome: CommandResult | CommandFailure (kept as Any to break the import cycle).
    """
    try:
        is_failure = getattr(outcome, "ok", True) is False
        action = f"command:{outcome.name}"
        result = "failure" if is_failure else "ok"
        if outcome.dry_run:
            result = "dry_run"
        detail = {
            "command_id": outcome.command_id,
            "duration_ms": outcome.duration_ms,
            "dry_run": outcome.dry_run,
        }
        if is_failure:
            detail["error_kind"] = outcome.error_kind
            detail["error_message"] = outcome.error_message
        else:
            detail["payload_out"] = outcome.payload_out
        append_audit(
            action=action,
            actor=outcome.actor,
            resource=outcome.name,
            outcome=result,
            correlation_id=outcome.correlation_id,
            detail=detail,
        )
    except Exception:  # noqa: BLE001
        pass


def append_event_outcome(event: Event) -> None:
    try:
        append_audit(
            action=f"event:{event.name}",
            actor=event.actor,
            resource=event.source,
            outcome="ok",
            correlation_id=event.correlation_id,
            detail={"event_id": event.event_id, "payload": event.payload},
        )
    except Exception:  # noqa: BLE001
        pass


def read_recent(limit: int = 200) -> list[dict]:
    if not os.path.exists(AUDIT_FILE):
        return []
    try:
        with open(AUDIT_FILE, encoding="utf-8") as fh:
            tail: list[str] = fh.readlines()[-max(1, min(limit, 5000)) :]
    except OSError:
        return []
    out: list[dict] = []
    for line in tail:
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except Exception:  # noqa: BLE001
            continue
    return out


def audit_count() -> int:
    if not os.path.exists(AUDIT_FILE):
        return 0
    try:
        with open(AUDIT_FILE, encoding="utf-8") as fh:
            return sum(1 for _ in fh)
    except OSError:
        return 0


def now() -> float:
    return time.time()
