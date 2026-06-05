"""JARVIS EVENTS — the immutable nervous system (event log + CQRS projections).

The doctrine's Layer 5: an append-only event backbone every state change flows
through, with durable consumers, replay and projections. Implemented natively
(stdlib only, never raises) as an event-sourcing substrate:

  * APPEND-ONLY LOG — emit(stream,type,payload); events get a monotonic seq + ts
    and are never mutated (immutable history).
  * DURABLE CONSUMERS — each consumer has a persisted offset; poll() returns only
    unseen events and advances the offset (at-least-once delivery).
  * REPLAY — reconstruct any stream's history in order.
  * PROJECTIONS — fold a stream into a read model (CQRS read side).

This is the in-process model of a Kafka-style backbone: the control logic is real;
a distributed broker is the pluggable substrate underneath.
"""

from __future__ import annotations

import json
import sqlite3
import time

from . import jarvis_os as jos

try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "jarvis_os.db")


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    try:
        c = _conn()
        try:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS jevt_event (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, stream TEXT,
                    type TEXT, payload TEXT, actor TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_jevt_stream ON jevt_event(stream, seq);
                CREATE TABLE IF NOT EXISTS jevt_offset (consumer TEXT PRIMARY KEY, last_seq INTEGER);
                """
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def emit(stream: str, type: str, payload: dict | None = None, *, actor: str = "system") -> dict:
    """Append an immutable event. Returns the assigned seq."""
    init_db()
    ts = int(time.time() * 1000)
    try:
        c = _conn()
        try:
            cur = c.execute("INSERT INTO jevt_event (ts,stream,type,payload,actor) VALUES (?,?,?,?,?)",
                            (ts, stream, type, json.dumps(payload or {}, default=str), actor))
            seq = cur.lastrowid
            c.commit()
        finally:
            c.close()
        return {"seq": seq, "ts": ts, "stream": stream, "type": type}
    except Exception:  # noqa: BLE001
        return {"seq": None, "stream": stream, "type": type}


def subscribe(consumer: str) -> dict:
    init_db()
    try:
        c = _conn()
        try:
            c.execute("INSERT OR IGNORE INTO jevt_offset (consumer,last_seq) VALUES (?,0)", (consumer,))
            c.commit()
            row = c.execute("SELECT last_seq FROM jevt_offset WHERE consumer=?", (consumer,)).fetchone()
        finally:
            c.close()
        return {"consumer": consumer, "offset": row["last_seq"] if row else 0}
    except Exception:  # noqa: BLE001
        return {"consumer": consumer, "offset": 0}


def poll(consumer: str, *, types: list[str] | None = None, limit: int = 100,
         commit: bool = True) -> dict:
    """Return events the consumer has not seen and advance its offset."""
    init_db()
    subscribe(consumer)
    try:
        c = _conn()
        try:
            off = c.execute("SELECT last_seq FROM jevt_offset WHERE consumer=?", (consumer,)).fetchone()
            last = off["last_seq"] if off else 0
            rows = c.execute("SELECT * FROM jevt_event WHERE seq>? ORDER BY seq ASC LIMIT ?",
                             (last, max(1, int(limit)))).fetchall()
            evts = [dict(r) for r in rows]
            if types:
                tset = set(types)
                evts = [e for e in evts if e["type"] in tset]
            new_last = rows[-1]["seq"] if rows else last
            if commit and new_last != last:
                c.execute("UPDATE jevt_offset SET last_seq=? WHERE consumer=?", (new_last, consumer))
                c.commit()
        finally:
            c.close()
        for e in evts:
            e["payload"] = json.loads(e.get("payload") or "{}")
        return {"consumer": consumer, "from": last, "to": new_last, "events": evts}
    except Exception:  # noqa: BLE001
        return {"consumer": consumer, "events": []}


def replay(stream: str, limit: int = 1000) -> list[dict]:
    init_db()
    try:
        c = _conn()
        try:
            rows = c.execute("SELECT * FROM jevt_event WHERE stream=? ORDER BY seq ASC LIMIT ?",
                             (stream, max(1, int(limit)))).fetchall()
        finally:
            c.close()
        out = [dict(r) for r in rows]
        for e in out:
            e["payload"] = json.loads(e.get("payload") or "{}")
        return out
    except Exception:  # noqa: BLE001
        return []


def project(stream: str) -> dict:
    """A CQRS read-model projection: fold a stream into counts + last event/type."""
    evts = replay(stream)
    by_type: dict[str, int] = {}
    for e in evts:
        by_type[e["type"]] = by_type.get(e["type"], 0) + 1
    return {"stream": stream, "events": len(evts), "by_type": by_type,
            "last": evts[-1] if evts else None}


def stats() -> dict:
    init_db()
    try:
        c = _conn()
        try:
            n = c.execute("SELECT COUNT(*) FROM jevt_event").fetchone()[0]
            streams = [r["stream"] for r in c.execute("SELECT DISTINCT stream FROM jevt_event").fetchall()]
            consumers = c.execute("SELECT COUNT(*) FROM jevt_offset").fetchone()[0]
        finally:
            c.close()
        return {"events": n, "streams": streams, "consumers": consumers}
    except Exception:  # noqa: BLE001
        return {"events": 0, "streams": [], "consumers": 0}
