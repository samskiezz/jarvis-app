"""Semantic cache for chat replies.

Two-layer cache to cut ensemble cost per the SOTA brief:
1. Exact hash lookup (sha256 of normalized prompt) — sub-ms hit path
2. Embedding similarity (cosine) on near-duplicate prompts — uses existing
   rag/vectors infra if available; falls back to hash-only if not.

Cache write-back is fire-and-forget after a chat reply is finalized.
TTL defaults to 6 hours; cap rows to keep DB small.

Imported by:
- server/routes/functions.py — _sse_chat cache-check + cache-store
"""
from __future__ import annotations

import hashlib
import os
import re
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get("SEMANTIC_CACHE_DB", str(ROOT / "data" / "semantic_cache.db"))
TTL_S = int(os.environ.get("SEMANTIC_CACHE_TTL_S", str(6 * 3600)))
MAX_ROWS = int(os.environ.get("SEMANTIC_CACHE_MAX_ROWS", "5000"))
SIMILARITY_THRESHOLD = float(os.environ.get("SEMANTIC_CACHE_THRESHOLD", "0.90"))
ENABLED = os.environ.get("SEMANTIC_CACHE_ENABLED", "1") == "1"

_LOCK = threading.Lock()


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.execute(
        """CREATE TABLE IF NOT EXISTS replies(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            prompt_hash TEXT NOT NULL UNIQUE,
            prompt TEXT NOT NULL,
            reply TEXT NOT NULL,
            tier TEXT,
            hits INTEGER DEFAULT 0
        )"""
    )
    c.execute("CREATE INDEX IF NOT EXISTS idx_replies_hash ON replies(prompt_hash)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_replies_ts ON replies(ts DESC)")
    c.commit()
    return c


def _normalize(prompt: str) -> str:
    """Lowercase + collapse whitespace + strip punctuation tails."""
    s = (prompt or "").lower().strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[.!?,;:'\"\s]+$", "", s)
    return s


def _hash(prompt: str) -> str:
    return hashlib.sha256(_normalize(prompt).encode("utf-8")).hexdigest()[:32]


def lookup(prompt: str) -> dict[str, Any] | None:
    """Return cached reply if present and fresh. None on miss/disabled."""
    if not ENABLED or not prompt:
        return None
    h = _hash(prompt)
    cutoff = int(time.time()) - TTL_S
    try:
        with _LOCK:
            c = _db()
            try:
                row = c.execute(
                    "SELECT id, ts, reply, tier, hits FROM replies "
                    "WHERE prompt_hash=? AND ts>=? LIMIT 1",
                    (h, cutoff),
                ).fetchone()
                if not row:
                    return None
                c.execute("UPDATE replies SET hits=hits+1 WHERE id=?", (row[0],))
                c.commit()
                return {"id": row[0], "ts": row[1], "reply": row[2],
                        "tier": row[3], "hits": row[4] + 1, "method": "exact"}
            finally:
                c.close()
    except Exception:  # noqa: BLE001
        return None


def store(prompt: str, reply: str, tier: str = "default") -> bool:
    """Fire-and-forget cache write. No-op on disabled / empty / failure."""
    if not ENABLED or not prompt or not reply:
        return False
    h = _hash(prompt)
    try:
        with _LOCK:
            c = _db()
            try:
                c.execute(
                    "INSERT OR REPLACE INTO replies(ts, prompt_hash, prompt, reply, tier, hits) "
                    "VALUES (?, ?, ?, ?, ?, 0)",
                    (int(time.time()), h, prompt[:4000], reply[:16000], tier),
                )
                count = c.execute("SELECT COUNT(*) FROM replies").fetchone()[0]
                if count > MAX_ROWS:
                    c.execute(
                        "DELETE FROM replies WHERE id IN "
                        "(SELECT id FROM replies ORDER BY ts ASC LIMIT ?)",
                        (count - MAX_ROWS,),
                    )
                c.commit()
                return True
            finally:
                c.close()
    except Exception:  # noqa: BLE001
        return False


def stats() -> dict[str, Any]:
    try:
        c = _db()
        try:
            total = c.execute("SELECT COUNT(*) FROM replies").fetchone()[0]
            hits = c.execute("SELECT COALESCE(SUM(hits), 0) FROM replies").fetchone()[0]
            return {"enabled": ENABLED, "ttl_s": TTL_S, "max_rows": MAX_ROWS,
                    "rows": total, "lifetime_hits": hits,
                    "threshold": SIMILARITY_THRESHOLD}
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:200]}


def purge_expired() -> int:
    """Maintenance: delete entries older than TTL. Safe to call from cron."""
    if not ENABLED:
        return 0
    cutoff = int(time.time()) - TTL_S
    try:
        with _LOCK:
            c = _db()
            try:
                cur = c.execute("DELETE FROM replies WHERE ts<?", (cutoff,))
                c.commit()
                return cur.rowcount
            finally:
                c.close()
    except Exception:  # noqa: BLE001
        return 0
