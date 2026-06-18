"""Deterministic per-minion TTS voice seed cache.

Gap-audit #49: previously a minion's voice could drift across sessions because the
TTS layer picked a voice on each synth. This caches hash(minion_id) -> voice_index
in SQLite so the same minion always sounds the same.
"""
from __future__ import annotations

import hashlib
import os
import sqlite3
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.environ.get("TTS_VOICE_SEEDS_DB", os.path.join(ROOT, "data", "tts_voice_seeds.db"))


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB, timeout=10)
    c.execute("""CREATE TABLE IF NOT EXISTS voice_seeds(
        minion_id TEXT PRIMARY KEY,
        voice_index INTEGER NOT NULL,
        assigned_at INTEGER NOT NULL
    )""")
    c.commit()
    return c


def get_voice_index(minion_id: str, *, voice_pool_size: int = 16) -> int:
    """Return the voice index for this minion, persisting the first assignment.
    voice_pool_size = how many distinct voices are available in the TTS bank."""
    if not minion_id:
        return 0
    if voice_pool_size < 1:
        voice_pool_size = 1
    c = _db()
    try:
        r = c.execute("SELECT voice_index FROM voice_seeds WHERE minion_id=?", (minion_id,)).fetchone()
        if r is not None:
            return int(r[0]) % voice_pool_size
        # First time: derive deterministically from a hash so a wipe-and-replay still gives the same voice
        h = int(hashlib.md5(minion_id.encode()).hexdigest()[:8], 16)
        idx = h % voice_pool_size
        try:
            c.execute("INSERT OR IGNORE INTO voice_seeds(minion_id, voice_index, assigned_at) VALUES(?, ?, ?)",
                      (minion_id, idx, int(time.time())))
            c.commit()
        except Exception:
            pass
        return idx
    finally:
        c.close()


def assigned_count() -> int:
    c = _db()
    try:
        return c.execute("SELECT COUNT(*) FROM voice_seeds").fetchone()[0]
    finally:
        c.close()
