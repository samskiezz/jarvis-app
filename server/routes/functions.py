from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import require_bearer
from ..llm.kimi import stream_chat
from ..services.live_intel import get_live_intel

router = APIRouter()


class ChatRequest(BaseModel):
    message: str


@router.post("/functions/getLiveIntel")
async def get_live_intel_route(_token: str = Depends(require_bearer)):
    return await get_live_intel()


async def _sse_chat(message: str):
    import json

    async for chunk in stream_chat(message):
        # JSON-encode so embedded newlines / quotes don't break SSE framing.
        yield f"data: {json.dumps(chunk)}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/functions/analystChat")
async def analyst_chat(req: ChatRequest, _token: str = Depends(require_bearer)):
    return StreamingResponse(_sse_chat(req.message), media_type="text/event-stream")


# Stub endpoints — return 202 acknowledgement so the existing kimiClient.functions.* calls
# don't blow up. Real implementations land in Phase C.
_STUB_FUNCTIONS = [
    "checkUrgentEmail",
    "runOmegaScanBatch",
    "psgJobPipeline",
    "gmailJobWatcher",
    "gmailJobWatcherV2",
    "psgEmailToOpenSolarToSM8",
    "psgEmailToOpenSolarToServiceM8",
    "addJobComponents",
    "psgPipelineHandler",
    "loadOmegaContext",
    "getJarvisIntel",
]

for _name in _STUB_FUNCTIONS:
    def _make(name: str):
        async def _handler(_token: str = Depends(require_bearer)):
            return {"status": "not_implemented", "function": name}
        _handler.__name__ = f"stub_{name}"
        return _handler

    router.add_api_route(
        f"/functions/{_name}", _make(_name), methods=["POST"], name=f"stub_{_name}"
    )
