"""GRAPH STREAM WebSocket route — live binary graph deltas.

  * WS /v1/graph/stream  — on connect, sends a binary SNAPSHOT of the ontology
    graph (NODE/EDGE frames + SNAPSHOT_END), then streams binary DELTA frames as
    the ontology changes, plus a periodic heartbeat.

This is the concrete backend for ``engine/binaryTransport.BinaryDeltaSocket``.
The DB read runs in a worker thread so the event loop is never blocked. The poll
interval is configurable via ``?interval=`` (clamped 0.5..10s).
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..services import graph_stream as gs

router = APIRouter()


@router.websocket("/v1/graph/stream")
async def graph_stream(ws: WebSocket):
    await ws.accept()
    try:
        interval = float(ws.query_params.get("interval", "2.0"))
    except (TypeError, ValueError):
        interval = 2.0
    interval = min(10.0, max(0.5, interval))

    try:
        graph = await asyncio.to_thread(gs.fetch_graph)
        for frame in gs.snapshot_frames(graph):
            await ws.send_bytes(frame)
        state = gs.state_of(graph)

        while True:
            await asyncio.sleep(interval)
            graph = await asyncio.to_thread(gs.fetch_graph)
            curr = gs.state_of(graph)
            for frame in gs.delta_frames(state, curr):
                await ws.send_bytes(frame)
            state = curr
            await ws.send_bytes(gs.encode_heartbeat())
    except WebSocketDisconnect:
        return
    except Exception:  # noqa: BLE001 - never let a stream error crash the worker
        try:
            await ws.close()
        except Exception:  # noqa: BLE001
            pass
