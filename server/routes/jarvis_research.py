"""JARVIS RESEARCH route — LLM-driven autonomous research + injection."""
from __future__ import annotations
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from ..auth import optional_bearer, require_bearer
from ..services import llm_research as lr
from ..services import llm_autopilot as ap

router = APIRouter(prefix="/v1/jarvis/research", tags=["jarvis-research"])

class ResearchBody(BaseModel):
    topic: str
    max_subtopics: int = Field(default=5, ge=1, le=12)
    inject: bool = True

class ConnectBody(BaseModel):
    ollama_host: str
    model: str | None = None

@router.get("/status")
async def status(_t: str | None = Depends(optional_bearer)):
    return {"backend": lr.backend(), "available": lr.available(),
            "autopilot": ap.status(), "connection": lr.connection_info(),
            "hint": "set OLLAMA_HOST to your Llama (e.g. http://host:11434) or KIMI_API_KEY"}

@router.get("/connection")
async def connection(_t: str | None = Depends(optional_bearer)):
    return lr.connection_info()

@router.post("/connect")
async def connect(body: ConnectBody, _t: str = Depends(require_bearer)):
    """Point JARVIS at your GPU's Ollama at runtime (persisted; no restart). Tests it,
    and on success starts the GPU autopilot so the GPU starts hammering immediately."""
    res = lr.connect(body.ollama_host, model=body.model)
    if res.get("ok"):
        try:
            ap.start()
        except Exception:  # noqa: BLE001
            pass
    return res

@router.post("")
async def run(body: ResearchBody, _t: str = Depends(require_bearer)):
    return lr.research(body.topic, max_subtopics=body.max_subtopics, inject=body.inject)

# ── continuous GPU autopilot ─────────────────────────────────────────────────────
@router.get("/autopilot")
async def autopilot_status(_t: str | None = Depends(optional_bearer)):
    """Live state of the continuous LLM research loop (is the GPU being hammered)."""
    return ap.status()

@router.post("/autopilot/start")
async def autopilot_start(_t: str = Depends(require_bearer)):
    """Start hammering the GPU: continuously research topics through the LLM. Idempotent."""
    return ap.start()

@router.post("/autopilot/stop")
async def autopilot_stop(_t: str = Depends(require_bearer)):
    """Stop the continuous research loop. Idempotent."""
    return await ap.request_stop()
