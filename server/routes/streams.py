"""Server-Sent Events endpoints for the live tactical simulations.

EventSource (used by the frontend) issues a plain GET and cannot attach an
Authorization header, so these use optional_bearer: open in the default
local/playable build, lockable via JARVIS_REQUIRE_AUTH. Each connection streams
JSON frames from the shared simulation at a fixed tick rate.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..auth import optional_bearer
from ..services.simulation import get_game

router = APIRouter()

_HZ = 8.0


async def _frames(key: str):
    game = get_game(key)
    while True:
        game.step_to_now(_HZ)
        frame = game.frame()
        frame["maps"] = game.maps
        yield f"data: {json.dumps(frame)}\n\n"
        await asyncio.sleep(1.0 / _HZ)


@router.get("/streams/{key}")
async def stream_game(
    key: str,
    map: str | None = Query(default=None),
    _token: str | None = Depends(optional_bearer),
):
    game = get_game(key)
    if not game:
        raise HTTPException(status_code=404, detail=f"unknown stream '{key}'")
    if map:
        game.set_map(map)
    return StreamingResponse(
        _frames(key),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
