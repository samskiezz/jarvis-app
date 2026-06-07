"""Persistent Memory Per User — SQLite-based memory and relationship model.

The memory store is queryable by the LLM agent for personalized responses.
All operations are async (wrapped via ``asyncio.to_thread``) so they do not
block the event loop.  Never raises — degrades gracefully to empty results.

Tables
  * user_memory      — (user_id, key, value, importance, created_at, updated_at)
  * user_relationship — (user_id, trait, evidence, confidence)
"""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import time
from typing import Optional

_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "memory.db"
)


def _db_path() -> str:
    return os.environ.get("MEMORY_DB", _DEFAULT_DB)


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def _init_sync() -> None:
    """Synchronous init for table creation."""
    try:
        c = _conn()
        try:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS user_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    importance REAL DEFAULT 0.5,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_mem_user ON user_memory(user_id);
                CREATE INDEX IF NOT EXISTS idx_mem_key ON user_memory(user_id, key);
                CREATE INDEX IF NOT EXISTS idx_mem_importance ON user_memory(importance DESC);

                CREATE TABLE IF NOT EXISTS user_relationship (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    trait TEXT NOT NULL,
                    evidence TEXT NOT NULL,
                    confidence REAL DEFAULT 0.5,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_rel_user ON user_relationship(user_id);
                CREATE INDEX IF NOT EXISTS idx_rel_trait ON user_relationship(user_id, trait);
                """
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


async def init_db() -> None:
    """Idempotent DDL initialization."""
    await asyncio.to_thread(_init_sync)


# ── Memory CRUD ──────────────────────────────────────────────────────────────

async def remember(
    user_id: str,
    key: str,
    value: str,
    importance: float = 0.5,
) -> dict:
    """Store or overwrite a memory key for a user."""
    await init_db()
    now = int(time.time())
    uid = str(user_id or "anonymous")
    k = str(key or "")[:512]
    v = str(value or "")[:8192]
    imp = max(0.0, min(1.0, float(importance)))
    try:

        def _upsert():
            c = _conn()
            try:
                existing = c.execute(
                    "SELECT id FROM user_memory WHERE user_id=? AND key=?",
                    (uid, k),
                ).fetchone()
                if existing:
                    c.execute(
                        "UPDATE user_memory SET value=?, importance=?, updated_at=? WHERE id=?",
                        (v, imp, now, existing["id"]),
                    )
                else:
                    c.execute(
                        "INSERT INTO user_memory (user_id,key,value,importance,created_at,updated_at) VALUES (?,?,?,?,?,?)",
                        (uid, k, v, imp, now, now),
                    )
                c.commit()
            finally:
                c.close()

        await asyncio.to_thread(_upsert)
        return {"ok": True, "user_id": uid, "key": k, "importance": imp}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "user_id": uid, "key": k}


async def recall(
    user_id: str,
    key: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """Recall memories for a user, optionally filtered by key substring."""
    await init_db()
    uid = str(user_id or "anonymous")
    lim = max(1, int(limit))
    try:

        def _query():
            c = _conn()
            try:
                if key:
                    pattern = f"%{key}%"
                    rows = c.execute(
                        "SELECT * FROM user_memory WHERE user_id=? AND (key LIKE ? OR value LIKE ?) ORDER BY importance DESC, updated_at DESC LIMIT ?",
                        (uid, pattern, pattern, lim),
                    ).fetchall()
                else:
                    rows = c.execute(
                        "SELECT * FROM user_memory WHERE user_id=? ORDER BY importance DESC, updated_at DESC LIMIT ?",
                        (uid, lim),
                    ).fetchall()
            finally:
                c.close()
            return [dict(r) for r in rows]

        return await asyncio.to_thread(_query)
    except Exception:  # noqa: BLE001
        return []


async def forget(user_id: str, key: str) -> dict:
    """Remove a specific memory key."""
    await init_db()
    uid = str(user_id or "anonymous")
    k = str(key or "")
    try:

        def _delete():
            c = _conn()
            try:
                c.execute("DELETE FROM user_memory WHERE user_id=? AND key=?", (uid, k))
                c.commit()
                return c.total_changes
            finally:
                c.close()

        changed = await asyncio.to_thread(_delete)
        return {"ok": True, "deleted": changed}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


# ── Relationship / Personality ───────────────────────────────────────────────

async def note_trait(
    user_id: str,
    trait: str,
    evidence: str,
    confidence: float = 0.5,
) -> dict:
    """Record a personality/relationship trait for a user."""
    await init_db()
    now = int(time.time())
    uid = str(user_id or "anonymous")
    t = str(trait or "")[:512]
    ev = str(evidence or "")[:4096]
    conf = max(0.0, min(1.0, float(confidence)))
    try:

        def _upsert():
            c = _conn()
            try:
                existing = c.execute(
                    "SELECT id FROM user_relationship WHERE user_id=? AND trait=?",
                    (uid, t),
                ).fetchone()
                if existing:
                    c.execute(
                        "UPDATE user_relationship SET evidence=?, confidence=?, updated_at=? WHERE id=?",
                        (ev, conf, now, existing["id"]),
                    )
                else:
                    c.execute(
                        "INSERT INTO user_relationship (user_id,trait,evidence,confidence,created_at,updated_at) VALUES (?,?,?,?,?,?)",
                        (uid, t, ev, conf, now, now),
                    )
                c.commit()
            finally:
                c.close()

        await asyncio.to_thread(_upsert)
        return {"ok": True, "user_id": uid, "trait": t, "confidence": conf}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


async def get_traits(user_id: str, limit: int = 20) -> list[dict]:
    """List observed traits for a user."""
    await init_db()
    uid = str(user_id or "anonymous")
    lim = max(1, int(limit))
    try:

        def _query():
            c = _conn()
            try:
                rows = c.execute(
                    "SELECT * FROM user_relationship WHERE user_id=? ORDER BY confidence DESC, updated_at DESC LIMIT ?",
                    (uid, lim),
                ).fetchall()
            finally:
                c.close()
            return [dict(r) for r in rows]

        return await asyncio.to_thread(_query)
    except Exception:  # noqa: BLE001
        return []


async def summarize_user(user_id: str) -> dict:
    """Return a personality profile synthesized from traits and top memories."""
    await init_db()
    uid = str(user_id or "anonymous")
    try:
        traits = await get_traits(uid, limit=20)
        top_memories = await recall(uid, limit=10)
        profile_lines: list[str] = []
        if traits:
            profile_lines.append("Observed traits:")
            for tr in traits:
                profile_lines.append(f"- {tr['trait']} (confidence {tr['confidence']:.0%}): {tr['evidence']}")
        if top_memories:
            profile_lines.append("Top memories:")
            for m in top_memories:
                profile_lines.append(f"- {m['key']} [{m['importance']:.0%}]: {m['value'][:200]}")
        return {
            "user_id": uid,
            "trait_count": len(traits),
            "memory_count": len(await recall(uid, limit=10000)),
            "profile_text": "\n".join(profile_lines) if profile_lines else "No data yet.",
            "traits": traits,
            "top_memories": top_memories,
        }
    except Exception as exc:  # noqa: BLE001
        return {"user_id": uid, "trait_count": 0, "memory_count": 0, "profile_text": "", "error": str(exc)}


# ── Utility: clear (test helper) ─────────────────────────────────────────────

async def clear_user(user_id: str) -> dict:
    """Remove all data for a user — useful in tests."""
    await init_db()
    uid = str(user_id or "anonymous")
    try:

        def _del():
            c = _conn()
            try:
                c.execute("DELETE FROM user_memory WHERE user_id=?", (uid,))
                c.execute("DELETE FROM user_relationship WHERE user_id=?", (uid,))
                c.commit()
            finally:
                c.close()

        await asyncio.to_thread(_del)
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
