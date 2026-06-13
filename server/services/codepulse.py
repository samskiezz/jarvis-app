"""CODE PULSE — VS Code bridge + approval queue.

Lightweight HTTP bridge for a future VS Code extension. Stores connection state and
pending AI actions in a JSON state file; the live UI polls for approvals.
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from . import llm_router
from . import mini_app_state as mas
from . import panickey

APP = "codepulse"
VALID_TYPES = {"edit", "create", "delete", "shell", "refactor", "test", "deploy"}
VALID_STATUSES = {"pending", "explaining", "approved", "rejected", "completed"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _now_ms() -> int:
    return int(time.time() * 1000)


def _state() -> dict[str, Any]:
    return mas.ensure(
        APP,
        {
            "connected": False,
            "workspace": None,
            "connected_at": None,
            "last_ping_at": None,
            "jobs": [],
            "pending": [],
            "history": [],
        },
    )


def _save(s: dict[str, Any]) -> bool:
    return mas.save(APP, s)


def _trim_pending(s: dict[str, Any]) -> None:
    s["pending"] = [p for p in s.get("pending", []) if p.get("status") in VALID_STATUSES][:200]


def _trim_history(s: dict[str, Any], limit: int = 200) -> None:
    s["history"] = s.get("history", [])[-limit:]


def connect(workspace: str) -> dict[str, Any]:
    s = _state()
    s["connected"] = True
    s["workspace"] = workspace.strip() if workspace else None
    s["connected_at"] = _now_iso()
    s["last_ping_at"] = _now_iso()
    _save(s)
    return {"ok": True, "connected": True, "workspace": s["workspace"]}


def disconnect() -> dict[str, Any]:
    s = _state()
    s["connected"] = False
    s["last_ping_at"] = _now_iso()
    _save(s)
    return {"ok": True, "connected": False}


def status() -> dict[str, Any]:
    s = _state()
    pending = [p for p in s.get("pending", []) if p.get("status") == "pending"]
    return {
        "connected": s.get("connected", False),
        "workspace": s.get("workspace"),
        "connected_at": s.get("connected_at"),
        "last_ping_at": s.get("last_ping_at"),
        "jobs": s.get("jobs", []),
        "pending_count": len(pending),
        "pending": pending,
        "history_count": len(s.get("history", [])),
    }


def command(cmd_type: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    s = _state()
    s["last_ping_at"] = _now_iso()

    if cmd_type == "ping":
        _save(s)
        return {"ok": True}

    if cmd_type == "job_start":
        job = {
            "id": payload.get("id") or f"job-{uuid.uuid4().hex[:8]}",
            "name": payload.get("name", "vscode job"),
            "status": "running",
            "started_at": _now_iso(),
        }
        s.setdefault("jobs", []).append(job)
        s["jobs"] = s["jobs"][-50:]
        _save(s)
        return {"ok": True, "job": job}

    if cmd_type == "job_end":
        jid = payload.get("id")
        for j in s.get("jobs", []):
            if j.get("id") == jid:
                j["status"] = payload.get("status", "completed")
                j["ended_at"] = _now_iso()
                break
        _save(s)
        return {"ok": True}

    if cmd_type == "action_request":
        item = {
            "id": f"cp-{uuid.uuid4().hex[:8]}",
            "type": payload.get("type", "edit"),
            "status": "pending",
            "source": payload.get("source", "vscode"),
            "workspace": s.get("workspace"),
            "description": (payload.get("description") or "")[:500],
            "file": (payload.get("file") or "")[:300],
            "diff": (payload.get("diff") or "")[:20000],
            "safe_option": (payload.get("safe_option") or "")[:500],
            "created_at": _now_iso(),
            "resolved_at": None,
            "resolution": None,
        }
        if item["type"] not in VALID_TYPES:
            item["type"] = "edit"
        s.setdefault("pending", []).append(item)
        _trim_pending(s)
        _save(s)
        return {"ok": True, "item": item}

    # Generic event log.
    s.setdefault("history", []).append({"t": _now_ms(), "type": cmd_type, "payload": payload})
    _trim_history(s)
    _save(s)
    return {"ok": True}


def list_pending(status: str | None = None) -> list[dict[str, Any]]:
    s = _state()
    items = s.get("pending", [])
    if status:
        items = [p for p in items if p.get("status") == status]
    return items


def _resolve(item_id: str, resolution: str, note: str = "") -> dict[str, Any]:
    s = _state()
    for p in s.get("pending", []):
        if p.get("id") == item_id:
            p["status"] = resolution
            p["resolved_at"] = _now_iso()
            p["resolution"] = note
            s.setdefault("history", []).append({"t": _now_ms(), "type": f"resolved:{resolution}", "item_id": item_id})
            _trim_history(s)
            _save(s)
            return {"ok": True, "item": p}
    return {"ok": False, "error": "item not found"}


def get_item(item_id: str) -> Optional[dict[str, Any]]:
    s = _state()
    for p in s.get("pending", []):
        if p.get("id") == item_id:
            return p
    return None


def approve(item_id: str) -> dict[str, Any]:
    return _resolve(item_id, "approved")


def reject(item_id: str, reason: str = "") -> dict[str, Any]:
    return _resolve(item_id, "rejected", reason)


def explain(item_id: str) -> dict[str, Any]:
    item = get_item(item_id)
    if item is None:
        return {"ok": False, "error": "item not found"}
    explanation = ""
    try:
        prompt = (
            "You are CodePulse. A VS Code AI action needs explanation. "
            "Describe what this action does, the risks, and the safe option in 2-3 sentences."
        )
        msg = (
            f"Action type: {item.get('type')}\n"
            f"Description: {item.get('description')}\n"
            f"File: {item.get('file')}\n"
            f"Safe option: {item.get('safe_option', 'none')}\n"
            f"Diff excerpt: {item.get('diff', '')[:800]}"
        )
        explanation = llm_router.complete(message=msg, system_prompt=prompt, max_tokens=256) or ""
    except Exception:  # noqa: BLE001
        explanation = ""
    result = _resolve(item_id, "explaining", explanation)
    result["explanation"] = explanation
    return result


def stop() -> dict[str, Any]:
    return panickey.set_mode("safe")
