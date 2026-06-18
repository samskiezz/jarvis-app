"""Reminders backend — durable storage for the Reminders mini-app overlay (#ovReminders).

Gap-audit #22+#23: the live UI's `saveReminder()` previously just showed an in-place
"Reminder saved" alert and discarded the text. Now it POSTs here and we persist to
SQLite at server/data/reminders.db.
"""
from __future__ import annotations

import os
import sqlite3
import time
from typing import Any

from fastapi import APIRouter, Body, HTTPException

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # .../server
DB_PATH = os.environ.get("REMINDERS_DB", os.path.join(ROOT, "data", "reminders.db"))

router = APIRouter(prefix="/reminders", tags=["reminders"])


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.execute(
        """CREATE TABLE IF NOT EXISTS reminders(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            text TEXT NOT NULL,
            kind TEXT DEFAULT 'note',
            done INTEGER DEFAULT 0
        )"""
    )
    c.commit()
    return c


@router.get("/list")
def list_reminders(limit: int = 50, include_done: bool = False) -> dict[str, Any]:
    """Most-recent first. `include_done=true` returns archived items too."""
    limit = max(1, min(500, int(limit)))
    c = _db()
    try:
        where = "" if include_done else "WHERE done=0"
        rows = c.execute(
            f"SELECT id, ts, text, kind, done FROM reminders {where} "
            "ORDER BY ts DESC LIMIT ?",
            (limit,),
        ).fetchall()
        items = [{"id": r[0], "ts": r[1], "text": r[2], "kind": r[3], "done": bool(r[4])}
                 for r in rows]
        return {"ok": True, "items": items, "count": len(items)}
    finally:
        c.close()


@router.post("/save")
def save_reminder(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """Append a reminder. `text` is required; `kind` defaults to 'note'."""
    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > 4000:
        raise HTTPException(status_code=400, detail="text too long (max 4000 chars)")
    kind = (payload.get("kind") or "note").strip()[:24] or "note"
    c = _db()
    try:
        cur = c.execute(
            "INSERT INTO reminders(ts, text, kind, done) VALUES(?, ?, ?, 0)",
            (int(time.time()), text, kind),
        )
        c.commit()
        return {"ok": True, "id": cur.lastrowid, "ts": int(time.time())}
    finally:
        c.close()


@router.post("/done/{rid}")
def mark_done(rid: int) -> dict[str, Any]:
    """Mark a reminder archived. Idempotent."""
    c = _db()
    try:
        c.execute("UPDATE reminders SET done=1 WHERE id=?", (rid,))
        c.commit()
        return {"ok": True, "id": rid}
    finally:
        c.close()


@router.delete("/{rid}")
def delete_reminder(rid: int) -> dict[str, Any]:
    """Hard-delete. The UI shows non-done items by default; this is for the
    'really delete' affordance in the reminders panel."""
    c = _db()
    try:
        cur = c.execute("DELETE FROM reminders WHERE id=?", (rid,))
        c.commit()
        return {"ok": True, "id": rid, "deleted": cur.rowcount}
    finally:
        c.close()
