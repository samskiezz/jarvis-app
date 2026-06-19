"""Chat-reply scoring + rating channel.

Closes the missing reward channel identified by audit/brain/seams-and-providers.md:
- Captures every (prompt, reply, tier, ts) into chat_judge.db.
- Exposes record_turn() for the streaming path.
- Exposes set_rating(turn_id, score, comment) for the UI thumbs-up/thumbs-down.
- Top-rated turns become few-shot exemplars retrievable by similarity.

Imported by:
- server/routes/functions.py — after streaming, call record_turn(session_id, prompt, reply).
- server/routes/functions.py — /functions/chatRate endpoint calls set_rating.
"""
from __future__ import annotations

import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent  # server/
DB_PATH = os.environ.get("CHAT_JUDGE_DB", str(ROOT / "data" / "chat_judge.db"))
_LOCK = threading.Lock()


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.execute(
        """CREATE TABLE IF NOT EXISTS turns(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            session_id TEXT,
            prompt TEXT NOT NULL,
            reply TEXT NOT NULL,
            tier TEXT,
            backend TEXT,
            rating INTEGER,
            comment TEXT,
            scored_by TEXT
        )"""
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_turns_ts ON turns(ts DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_turns_rating ON turns(rating DESC, ts DESC)")
    c.commit()
    return c


def record_turn(session_id: str | None, prompt: str, reply: str,
                tier: str = "default", backend: str | None = None) -> int:
    """Persist a chat turn. Returns the row id so the UI can rate it later.
    Returns 0 on any failure — this is fire-and-forget from the streaming path."""
    if not prompt or not reply:
        return 0
    try:
        with _LOCK:
            c = _db()
            try:
                cur = c.execute(
                    "INSERT INTO turns(ts, session_id, prompt, reply, tier, backend) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (int(time.time()), session_id, prompt[:8000], reply[:16000], tier, backend),
                )
                c.commit()
                return int(cur.lastrowid)
            finally:
                c.close()
    except Exception:  # noqa: BLE001
        return 0


def set_rating(turn_id: int, rating: int, comment: str | None = None,
               scored_by: str = "owner") -> bool:
    """rating in {-1, 0, 1} from UI thumbs-down/skip/up. Returns True on success."""
    if rating not in (-1, 0, 1):
        return False
    try:
        with _LOCK:
            c = _db()
            try:
                cur = c.execute(
                    "UPDATE turns SET rating=?, comment=?, scored_by=? WHERE id=?",
                    (rating, (comment or "")[:2000], scored_by, int(turn_id)),
                )
                c.commit()
                return cur.rowcount > 0
            finally:
                c.close()
    except Exception:  # noqa: BLE001
        return False


def top_exemplars(query: str = "", limit: int = 5) -> list[dict[str, Any]]:
    """Return top-rated turns. With query, keyword-match; without, recency."""
    try:
        c = _db()
        try:
            if query:
                like = f"%{query[:80]}%"
                rows = c.execute(
                    "SELECT id, ts, prompt, reply, tier, rating FROM turns "
                    "WHERE rating >= 1 AND (prompt LIKE ? OR reply LIKE ?) "
                    "ORDER BY rating DESC, ts DESC LIMIT ?",
                    (like, like, max(1, min(20, int(limit)))),
                ).fetchall()
            else:
                rows = c.execute(
                    "SELECT id, ts, prompt, reply, tier, rating FROM turns "
                    "WHERE rating >= 1 ORDER BY ts DESC LIMIT ?",
                    (max(1, min(20, int(limit))),),
                ).fetchall()
            return [
                {"id": r[0], "ts": r[1], "prompt": r[2], "reply": r[3],
                 "tier": r[4], "rating": r[5]}
                for r in rows
            ]
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return []


def stats() -> dict[str, Any]:
    """Quick counts for the dashboard."""
    try:
        c = _db()
        try:
            total = c.execute("SELECT COUNT(*) FROM turns").fetchone()[0]
            rated = c.execute("SELECT COUNT(*) FROM turns WHERE rating IS NOT NULL").fetchone()[0]
            up = c.execute("SELECT COUNT(*) FROM turns WHERE rating = 1").fetchone()[0]
            down = c.execute("SELECT COUNT(*) FROM turns WHERE rating = -1").fetchone()[0]
            return {"total": total, "rated": rated, "up": up, "down": down,
                    "rated_pct": round(100 * rated / max(1, total), 1)}
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:200]}
