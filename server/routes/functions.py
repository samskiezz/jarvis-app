from __future__ import annotations

import json
import os
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer
from ..services.llm_router import stream_chat as router_stream_chat
from ..services.analyst import answer as local_answer
from ..services.live_intel import get_live_intel
from ..services import rag as _rag
from ..services import jarvis_agent as _agent

try:
    from ..services import ontology_store as _store
except Exception:  # noqa: BLE001
    _store = None  # type: ignore[assignment]

router = APIRouter()

# In-memory conversation memory per session (simple; survives page reload via localStorage sync)
_chat_memory: dict[str, list[dict]] = {}
_MEMORY_CAP = 12


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    page_context: str | None = None
    use_agent: bool = False  # if True, run the tool-calling ReAct loop instead of raw stream


# ── system prompt builder ─────────────────────────────────────────────────────
def _load_analyst_prompt() -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "prompts", "analyst.md")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:  # noqa: BLE001
        return ""


def _ontology_summary(limit: int = 40) -> str:
    """Compact typed summary of the live ontology for the prompt."""
    if _store is None:
        return ""
    try:
        objs = _store.query_objects(limit=limit)
        lines = []
        for o in objs[:limit]:
            label = o.get("label") or o.get("id", "?")
            lines.append(f"- {label} ({o.get('type', '?')})")
        return "\n".join(lines)
    except Exception:  # noqa: BLE001
        return ""


async def _build_system_prompt(page_context: str | None = None, query: str = "") -> str:
    """Rich system prompt: persona + RAG + live intel + ontology + page context."""
    parts = []

    # 1. Persona
    persona = _load_analyst_prompt()
    if persona:
        if "{ontology}" in persona:
            persona = persona.replace("{ontology}", _ontology_summary(30))
        parts.append(persona)

    # 1b. Active behaviour mode (ModeMixer) — shapes tone/detail/safety/tool-use.
    try:
        from ..services import mode_mixer as _mm
        _md = _mm.prompt_directive()
        if _md:
            parts.append(_md)
    except Exception:  # noqa: BLE001
        pass

    # 2. RAG grounding
    if query:
        try:
            rag = _rag.build_context(query, k=5)
            if rag.get("count"):
                parts.append("\n[RETRIEVED CONTEXT]\n" + rag["context"])
        except Exception:  # noqa: BLE001
            pass

    # 3. Live intel snapshot
    try:
        live = await get_live_intel()
    except Exception:
        live = {}
    if live:
        snaps = []
        eq = live.get("earthquakes", [])
        if eq:
            snaps.append(f"Latest earthquake: M{eq[0].get('mag','?')} {eq[0].get('place','')}")
        mk = live.get("markets", [])
        if mk:
            snaps.append("Markets: " + ", ".join(f"{m.get('sym')} {m.get('price')}" for m in mk[:3]))
        pan = live.get("panopticon", {})
        if pan:
            snaps.append(f"Panopticon: tick={pan.get('tick')}, alerts={pan.get('alert_level')}")
        cs = live.get("counterstrike", {})
        if cs:
            snaps.append(f"Counter-Strike: round={cs.get('round')}, score={cs.get('score')}")
        if snaps:
            parts.append("\n[LIVE SNAPSHOT]\n" + "\n".join(snaps))

    # 4. Page context
    if page_context:
        parts.append(f"\n[PAGE CONTEXT] The user is currently viewing: {page_context}")

    # 5. Reminder rules
    parts.append(
        "\n[INSTRUCTIONS] "
        "Ground every claim with real data. If you lack data, say so plainly. "
        "Never invent figures, dates, or events. Be terse."
    )

    return "\n\n".join(parts)


# ── streaming helpers ─────────────────────────────────────────────────────────
async def _local_chat(message: str):
    """Stream the local analyst answer word-by-word for a live typing effect."""
    import asyncio
    live = await get_live_intel()
    text = local_answer(message, live)
    for word in text.split(" "):
        yield word + " "
        await asyncio.sleep(0.012)


async def _sse_chat(message: str, system_prompt: str):
    """Stream tokens from the unified LLM router with a rich system prompt."""
    source = router_stream_chat(message, system_prompt=system_prompt)
    async for chunk in source:
        yield f"data: {json.dumps(chunk)}\n\n"
    yield "data: [DONE]\n\n"


async def _agent_sse_chat(message: str, page_context: str | None, session_id: str | None):
    """Run the ReAct agent loop and stream its final answer + trace as SSE."""
    import asyncio

    sid = session_id or "default"
    history = _chat_memory.get(sid, [])

    # Run agent (sync call inside async; llm_research blocks the loop briefly)
    try:
        timeout_s = float(os.environ.get("JARVIS_AGENT_CHAT_TIMEOUT_S", "8"))
        result = await asyncio.wait_for(
            asyncio.to_thread(
                _agent.run_agent,
                message,
                history=history,
                actor="anonymous",
                max_steps=_agent.MAX_STEPS_DEFAULT,
            ),
            timeout=timeout_s,
        )
    except asyncio.TimeoutError:
        result = _agent.timeout_fallback(message, actor="anonymous")

    answer = result.get("answer", "")
    trace = result.get("trace", [])
    used_tools = result.get("used_tools", [])
    backend = result.get("backend", "unknown")

    # Store turn in memory
    history.append({"role": "user", "text": message})
    history.append({"role": "assistant", "text": answer})
    _chat_memory[sid] = history[-_MEMORY_CAP:]

    # Stream the answer word-by-word so the UI feels live
    words = answer.split(" ") if answer else ["(no answer)"]
    for word in words:
        yield f"data: {json.dumps(word + ' ')}\n\n"
        await asyncio.sleep(0.015)

    # Append metadata as a final non-content event the UI can ignore or log
    meta = json.dumps({"__meta": True, "tools": used_tools, "backend": backend, "steps": len(trace)})
    yield f"data: {meta}\n\n"
    yield "data: [DONE]\n\n"


# ── routes ────────────────────────────────────────────────────────────────────
@router.post("/functions/getLiveIntel")
async def get_live_intel_route(_token: str | None = Depends(optional_bearer)):
    return await get_live_intel()


@router.post("/functions/analystChat")
async def analyst_chat(req: ChatRequest, _token: str | None = Depends(optional_bearer)):
    """Smart analyst chat with RAG, live intel, memory, and optional agent tools."""
    if req.use_agent:
        return StreamingResponse(
            _agent_sse_chat(req.message, req.page_context, req.session_id),
            media_type="text/event-stream",
        )
    system = await _build_system_prompt(req.page_context, req.message)
    return StreamingResponse(_sse_chat(req.message, system), media_type="text/event-stream")


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
