"""INTENT INBOX — captures raw ideas before they become tasks, specs, reminders, or projects.

Backed by the second-brain note store (kind=intent). Every function degrades gracefully.
"""
from __future__ import annotations

import re
import time
from typing import Any, Optional

from . import second_brain as sb


def _slug(text: str) -> str:
    t = re.sub(r"[^a-zA-Z0-9\- ]+", "", text or "")
    t = re.sub(r"\s+", " ", t).strip()
    return t[:60] or "untitled"


def capture(text: str, source: str = "ui", actor: Optional[str] = None) -> dict[str, Any]:
    """Capture a raw intent. Returns the note or an error dict."""
    if not text or not str(text).strip():
        return {"ok": False, "error": "empty intent"}
    title = f"intent:{int(time.time()*1000)}:{_slug(text)}"
    note = sb.upsert_note(
        kind="intent",
        title=title,
        body_md=str(text).strip(),
        frontmatter={"source": source, "state": "raw", "captured_at": int(time.time() * 1000)},
        actor=actor,
    )
    if note is None:
        return {"ok": False, "error": "failed to save intent"}
    return {"ok": True, "intent": note}


def list_intents(state: Optional[str] = None, limit: int = 50) -> list[dict[str, Any]]:
    items = sb.list_notes(kind="intent", limit=limit)
    if state:
        items = [it for it in items if (it.get("frontmatter") or {}).get("state") == state]
    return items


def get_intent(intent_id: str) -> Optional[dict[str, Any]]:
    return sb.get_note(intent_id)


def set_state(intent_id: str, state: str) -> dict[str, Any]:
    note = sb.get_note(intent_id)
    if note is None:
        return {"ok": False, "error": "intent not found"}
    fm = dict(note.get("frontmatter") or {})
    fm["state"] = state
    fm["updated_at"] = int(time.time() * 1000)
    updated = sb.upsert_note(
        kind=note.get("kind", "intent"),
        title=note["title"],
        body_md=note.get("body_md", ""),
        frontmatter=fm,
        confidence=note.get("confidence"),
    )
    if updated is None:
        return {"ok": False, "error": "failed to update intent"}
    return {"ok": True, "intent": updated}


def convert(intent_id: str, target: str, actor: Optional[str] = None) -> dict[str, Any]:
    """Convert an intent into a spec/reminder/task/decision note."""
    note = sb.get_note(intent_id)
    if note is None:
        return {"ok": False, "error": "intent not found"}
    target = str(target).lower()
    if target not in ("spec", "reminder", "task", "decision"):
        return {"ok": False, "error": "unsupported target"}
    body = note.get("body_md", "").strip()
    title = body.split("\n")[0][:80] or f"{target} from intent"
    kind_map = {"spec": "spec", "reminder": "task", "task": "task", "decision": "decision"}
    new_note = sb.upsert_note(
        kind=kind_map[target],
        title=title,
        body_md=body,
        frontmatter={"converted_from": note.get("id"), "converted_at": int(time.time() * 1000)},
        actor=actor,
    )
    if new_note is None:
        return {"ok": False, "error": "failed to create target note"}
    set_state(intent_id, f"converted:{target}")
    return {"ok": True, "target": new_note}
