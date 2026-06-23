"""JARVIS Nexus — event bus router (/v1/bus/*).

Promotes the existing append-only event log (server/services/jarvis_events.py)
from an intra-process store to a network bus so every service — FastAPI,
dashboard, Palantir, Underworld, the worker loops — publishes/subscribes to ONE
shared event stream. SSE (not WebSocket) so the stdlib dashboard can proxy it.
Part of Nexus Phase 1.
"""
from __future__ import annotations

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..services import jarvis_events as jevt

router = APIRouter()


class EmitBody(BaseModel):
    topic: str = "nexus"
    type: str
    source: str = "unknown"
    payload: dict = Field(default_factory=dict)
    corr_id: Optional[str] = None


def _max_seq() -> int:
    try:
        c = jevt._conn()
        try:
            row = c.execute("SELECT MAX(seq) AS m FROM jevt_event").fetchone()
        finally:
            c.close()
        return int(row["m"] or 0)
    except Exception:  # noqa: BLE001
        return 0


def _tail(after_seq: int, topics: Optional[list[str]], limit: int = 200) -> list[dict]:
    jevt.init_db()
    try:
        c = jevt._conn()
        try:
            rows = c.execute(
                "SELECT seq,ts,stream,type,payload,actor FROM jevt_event WHERE seq>? ORDER BY seq ASC LIMIT ?",
                (after_seq, max(1, int(limit))),
            ).fetchall()
        finally:
            c.close()
        out = []
        for r in rows:
            d = dict(r)
            d["topic"] = d.pop("stream")
            d["payload"] = json.loads(d.get("payload") or "{}")
            if topics and d["topic"] not in topics:
                continue
            out.append(d)
        return out
    except Exception:  # noqa: BLE001
        return []


@router.post("/v1/bus/emit")
async def emit(body: EmitBody):
    payload = dict(body.payload or {})
    if body.corr_id:
        payload["corr_id"] = body.corr_id
    res = jevt.emit(body.topic, body.type, payload, actor=body.source)
    return {"ok": res.get("seq") is not None, **res}


@router.get("/v1/bus/poll")
async def poll(consumer: str = Query(...), types: str = Query(default=""), limit: int = 100):
    tlist = [t for t in types.split(",") if t] or None
    return jevt.poll(consumer, types=tlist, limit=limit)


@router.get("/v1/bus/stats")
async def stats():
    return jevt.stats()


@router.get("/v1/bus/stream")
async def stream(topics: str = Query(default=""), cursor: int = Query(default=0)):
    """SSE fan-out. cursor<=0 = only new events; cursor>0 = resume from that seq."""
    tlist = [t for t in topics.split(",") if t] or None

    async def gen():
        last = cursor if cursor > 0 else _max_seq()
        yield ": nexus-bus stream open\n\n"
        idle = 0
        while True:
            evts = _tail(last, tlist, limit=200)
            if evts:
                for e in evts:
                    last = e["seq"]
                    yield f"id: {e['seq']}\ndata: {json.dumps(e, default=str)}\n\n"
                idle = 0
            else:
                idle += 1
                if idle % 15 == 0:
                    yield ": heartbeat\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream")
