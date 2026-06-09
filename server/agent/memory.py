"""Agent OS — durable agent memory (sqlite).

A tiny, forgiving key/value+tags store the agent uses to remember facts, results
of tool runs, and user instructions across runs. Backed by
`server/data/agent_memory.db`.

Public surface (per ARCH spec):
    write(kind, key, value, tags=None) -> int        # new row id, or -1
    search(query, limit=20)           -> list[dict]  # LIKE over key/value/tags
    recent(kind=None, limit=20)       -> list[dict]
    get(row_id)                       -> dict | None

Design rules:
  * Never raises. Every public function swallows errors and returns a safe value
    (write -> row id or -1, search/recent -> [], get -> None). Memory is a
    *best-effort* side-channel; it must never break a run.
  * Each connection is created per-call (sqlite is happiest that way across the
    daemon threads the job system uses) with WAL + a short busy timeout.
  * `search` is a simple LIKE over key/value/tags — deterministic and dependency
    free, which is all the brain needs for recall.
  * Schema is created lazily and idempotently; the DB directory is created on
    demand so a fresh checkout works with no setup.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional

# server/agent/memory.py -> repo root is three dirs up.
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(_ROOT, "server", "data", "agent_memory.db")

_INIT_LOCK = threading.Lock()
_INITED = False

# Path-like arg keys are not relevant here; documented kinds in use across the
# Agent OS: fact, note, run, tool_result, backup_manifest.


def _connect() -> sqlite3.Connection:
    """Open a fresh connection with sane pragmas. Caller must close()."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    try:
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA busy_timeout=8000")
        c.execute("PRAGMA synchronous=NORMAL")
    except Exception:  # noqa: BLE001
        pass
    return c


def _ensure() -> None:
    """Create the table + indexes once (idempotent, thread-safe, never raises)."""
    global _INITED
    if _INITED:
        return
    with _INIT_LOCK:
        if _INITED:
            return
        try:
            c = _connect()
            try:
                c.execute(
                    """
                    CREATE TABLE IF NOT EXISTS memory (
                        id        INTEGER PRIMARY KEY AUTOINCREMENT,
                        kind      TEXT NOT NULL DEFAULT 'note',
                        key       TEXT NOT NULL DEFAULT '',
                        value     TEXT NOT NULL DEFAULT '',
                        tags      TEXT NOT NULL DEFAULT '',
                        ts        REAL NOT NULL DEFAULT 0
                    )
                    """
                )
                c.execute("CREATE INDEX IF NOT EXISTS ix_mem_kind ON memory(kind, ts DESC)")
                c.execute("CREATE INDEX IF NOT EXISTS ix_mem_key ON memory(key)")
                c.commit()
            finally:
                c.close()
            _INITED = True
        except Exception:  # noqa: BLE001
            # Leave _INITED False so a later call may retry; callers still get
            # a safe value from the surrounding try/except.
            pass


def _clamp_limit(limit: Any, default: int = 20) -> int:
    """Clamp an arbitrary limit into 1..500, falling back to `default`."""
    try:
        return max(1, min(int(limit), 500))
    except (TypeError, ValueError):
        return default


def _row_to_dict(r: sqlite3.Row) -> Dict[str, Any]:
    """Convert a Row to a plain dict; surface a parsed `value_json` when value
    looks like JSON (a dict/list payload that was json-encoded on write)."""
    d = dict(r)
    v = d.get("value")
    if isinstance(v, str):
        s = v.lstrip()
        if s[:1] in ("{", "["):
            try:
                d["value_json"] = json.loads(s)
            except Exception:  # noqa: BLE001
                pass
    return d


def write(kind: str, key: str, value: Any, tags: Optional[Any] = None) -> int:
    """Persist a memory row. `value` may be a str/dict/list (dicts/lists are
    JSON-encoded). `tags` may be a list/tuple/set or a comma/space string.
    Returns the new row id, or -1 on failure. Never raises."""
    _ensure()
    try:
        if isinstance(value, (dict, list)):
            value_s = json.dumps(value, ensure_ascii=False, default=str)
        else:
            value_s = "" if value is None else str(value)
        if isinstance(tags, (list, tuple, set)):
            tags_s = ",".join(str(t).strip() for t in tags if str(t).strip())
        else:
            tags_s = "" if tags is None else str(tags)
        c = _connect()
        try:
            cur = c.execute(
                "INSERT INTO memory(kind, key, value, tags, ts) VALUES (?,?,?,?,?)",
                (str(kind or "note"), str(key or ""), value_s, tags_s, time.time()),
            )
            c.commit()
            return int(cur.lastrowid)
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return -1


def search(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """LIKE search over key/value/tags, newest first. An empty query returns the
    most recent rows. Never raises."""
    _ensure()
    q = (query or "").strip()
    limit = _clamp_limit(limit)
    try:
        c = _connect()
        try:
            if not q:
                rows = c.execute(
                    "SELECT * FROM memory ORDER BY ts DESC, id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            else:
                like = f"%{q}%"
                rows = c.execute(
                    """
                    SELECT * FROM memory
                    WHERE key LIKE ? OR value LIKE ? OR tags LIKE ?
                    ORDER BY ts DESC, id DESC LIMIT ?
                    """,
                    (like, like, like, limit),
                ).fetchall()
            return [_row_to_dict(r) for r in rows]
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return []


def recent(kind: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    """Most-recent rows, optionally filtered by `kind`. Never raises."""
    _ensure()
    limit = _clamp_limit(limit)
    try:
        c = _connect()
        try:
            if kind:
                rows = c.execute(
                    "SELECT * FROM memory WHERE kind=? ORDER BY ts DESC, id DESC LIMIT ?",
                    (str(kind), limit),
                ).fetchall()
            else:
                rows = c.execute(
                    "SELECT * FROM memory ORDER BY ts DESC, id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [_row_to_dict(r) for r in rows]
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return []


def get(row_id: int) -> Optional[Dict[str, Any]]:
    """Fetch one row by id. Returns None if missing/failed. Never raises."""
    _ensure()
    try:
        c = _connect()
        try:
            r = c.execute(
                "SELECT * FROM memory WHERE id=?", (int(row_id),)
            ).fetchone()
            return _row_to_dict(r) if r else None
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return None


if __name__ == "__main__":
    # Self-contained smoke test against a throwaway DB so the real store is left
    # untouched. Verifies write/search/recent/get round-trips, JSON value
    # surfacing, tag normalization, limit clamping, and the never-raises contract.
    import tempfile

    _tmp = tempfile.mkdtemp(prefix="agent_mem_")
    DB_PATH = os.path.join(_tmp, "agent_memory.db")  # type: ignore[assignment]
    _INITED = False

    ok = True

    def _check(name: str, cond: bool) -> None:
        global ok
        status = "ok  " if cond else "FAIL"
        if not cond:
            ok = False
        print(f"  [{status}] {name}")

    print(f"smoke test -> {DB_PATH}")

    rid = write("fact", "box_llm", "http://211.72.13.201:41137/v1", tags=["infra", "llm"])
    _check("write returns positive id", isinstance(rid, int) and rid > 0)

    jid = write("tool_result", "gpu.status", {"vram_gb": 41.4, "models": 3}, tags="gpu,box")
    _check("write json value returns id", isinstance(jid, int) and jid > 0)

    note_id = write("note", "reminder", "remember the build rules", tags="note")
    _check("write note returns id", isinstance(note_id, int) and note_id > 0)

    row = get(jid)
    _check("get returns the json row", bool(row) and row.get("kind") == "tool_result")
    _check("json value surfaced as value_json",
           bool(row) and isinstance(row.get("value_json"), dict)
           and row["value_json"].get("models") == 3)
    _check("tags normalized to comma string",
           bool(get(rid)) and get(rid)["tags"] == "infra,llm")

    hits = search("211.72")
    _check("search finds by value substring",
           any(h["id"] == rid for h in hits))

    hits2 = search("gpu")
    _check("search finds by tags substring",
           any(h["id"] == jid for h in hits2))

    hits3 = search("box_llm")
    _check("search finds by key substring",
           any(h["id"] == rid for h in hits3))

    empty = search("")
    _check("empty query returns recent rows (newest first)",
           len(empty) >= 1 and empty[0]["id"] == note_id)

    rec = recent("note")
    _check("recent(kind) filters by kind",
           all(r["kind"] == "note" for r in rec) and any(r["id"] == note_id for r in rec))

    rec_all = recent(limit=2)
    _check("recent honors clamped limit", len(rec_all) <= 2)

    _check("recent with huge limit is clamped, not raised",
           isinstance(recent(limit=10_000_000), list))
    _check("search with bad limit falls back",
           isinstance(search("x", limit="not-a-number"), list))  # type: ignore[arg-type]

    # never-raises contract on odd inputs
    _check("write(None,None,None) does not raise",
           isinstance(write(None, None, None), int))  # type: ignore[arg-type]
    _check("get(missing) is None", get(10_000_000) is None)
    _check("get(bad) is None (no raise)", get("not-an-int") is None)  # type: ignore[arg-type]

    print("RESULT:", "PASS" if ok else "FAIL")
    raise SystemExit(0 if ok else 1)
