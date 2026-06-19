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

try:
    from ..services import user_memory as _user_memory
except Exception:  # noqa: BLE001
    _user_memory = None  # type: ignore[assignment]

try:
    from ..services import chat_judge as _chat_judge
except Exception:  # noqa: BLE001
    _chat_judge = None  # type: ignore[assignment]

try:
    from ..services import chat_ensemble as _ensemble
except Exception:  # noqa: BLE001
    _ensemble = None  # type: ignore[assignment]

try:
    from ..services import semantic_cache as _cache
except Exception:  # noqa: BLE001
    _cache = None  # type: ignore[assignment]

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


async def _build_system_prompt(page_context: str | None = None, query: str = "",
                                session_id: str | None = None) -> str:
    """Rich system prompt: persona + RAG + live intel + ontology + page context + memory."""
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

    # 1c. Owner long-term memory (closes the amnesia: facts surfaced by query relevance)
    if _user_memory is not None:
        try:
            mem = _user_memory.preamble(query or "", limit=6)
            if mem:
                parts.append("\n[OWNER MEMORY]\n" + mem)
        except Exception:  # noqa: BLE001
            pass

    # 1d. Recent conversation turns (last 6, this session)
    if session_id:
        hist = _chat_memory.get(session_id, [])[-6:]
        if hist:
            turns = []
            for h in hist:
                role = h.get("role", "user")
                txt = (h.get("content") or "")[:600]
                turns.append(f"{role.upper()}: {txt}")
            parts.append("\n[RECENT TURNS]\n" + "\n".join(turns))

    # 1e. Few-shot exemplars from top-rated prior turns (self-distillation loop)
    if _chat_judge is not None and query:
        try:
            exemplars = _chat_judge.top_exemplars(query, limit=3)
            if exemplars:
                ex_lines = []
                for e in exemplars:
                    ex_lines.append(f"Q: {(e.get('prompt') or '')[:200]}\nA: {(e.get('reply') or '')[:400]}")
                parts.append("\n[GOOD-PAST-ANSWERS] (replies the owner rated up — mirror this style/depth)\n" + "\n---\n".join(ex_lines))
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


async def _sse_chat(message: str, system_prompt: str, session_id: str | None = None):
    """Stream tokens from the unified LLM router with a rich system prompt.
    Cascade strategy:
      1. semantic_cache.lookup -> instant return on hit
      2. is_hard_intent + ensemble -> draft+critique+fuse for reasoning prompts
      3. otherwise -> single-shot llm_router stream (cheap path for chitchat)
    Always: collect reply -> persist (chat_memory, user_memory, chat_judge, cache).
    """
    import asyncio
    collected: list[str] = []
    tier_used = "router"

    if _cache is not None:
        try:
            cached = await asyncio.to_thread(_cache.lookup, message)
        except Exception:  # noqa: BLE001
            cached = None
        if cached:
            text = cached["reply"]
            for chunk in text.split(" "):
                yield f"data: {json.dumps(chunk + ' ')}\n\n"
                await asyncio.sleep(0.005)
            yield f"data: {json.dumps({'__meta': True, 'method': 'cache', 'hits': cached.get('hits')})}\n\n"
            yield "data: [DONE]\n\n"
            collected = [text]
            tier_used = "cache"
            await _persist_turn(session_id, message, "".join(collected), tier_used)
            return

    use_ensemble = (_ensemble is not None and _ensemble.is_hard_intent(message))
    if use_ensemble:
        try:
            result = await asyncio.to_thread(_ensemble.ensemble, message, system_prompt)
        except Exception:  # noqa: BLE001
            result = {"ok": False, "text": ""}
        if result.get("ok") and result.get("text"):
            text = result["text"]
            tier_used = f"ensemble:{result.get('method', '?')}"
            for chunk in text.split(" "):
                yield f"data: {json.dumps(chunk + ' ')}\n\n"
                await asyncio.sleep(0.008)
            meta = {"__meta": True, "method": "ensemble",
                    "drafts": [{"tier": d["tier"], "ok": d["ok"], "elapsed_s": d.get("elapsed_s")}
                               for d in result.get("drafts", [])],
                    "judge_tier": result.get("judge_tier"),
                    "total_elapsed_s": result.get("total_elapsed_s")}
            yield f"data: {json.dumps(meta)}\n\n"
            yield "data: [DONE]\n\n"
            collected = [text]
            await _persist_turn(session_id, message, "".join(collected), tier_used)
            return

    source = router_stream_chat(message, system_prompt=system_prompt)
    async for chunk in source:
        if isinstance(chunk, str):
            collected.append(chunk)
        yield f"data: {json.dumps(chunk)}\n\n"
    yield "data: [DONE]\n\n"
    await _persist_turn(session_id, message, "".join(collected).strip(), tier_used)


async def _persist_turn(session_id: str | None, message: str, reply: str, tier: str) -> None:
    """Shared post-stream tail: chat_memory + user_memory + chat_judge + semantic_cache."""
    import asyncio
    if not reply:
        return
    if session_id and reply:
        hist = _chat_memory.setdefault(session_id, [])
        hist.append({"role": "user", "content": message})
        hist.append({"role": "assistant", "content": reply})
        if len(hist) > _MEMORY_CAP * 2:
            del hist[: len(hist) - _MEMORY_CAP * 2]
    if _user_memory is not None and reply:
        try:
            await asyncio.to_thread(_user_memory.extract_and_store, message, reply)
        except Exception:  # noqa: BLE001
            pass
    if _chat_judge is not None and reply:
        try:
            await asyncio.to_thread(
                _chat_judge.record_turn, session_id, message, reply, tier, "ollama")
        except Exception:  # noqa: BLE001
            pass
    if _cache is not None and reply and tier != "cache":
        try:
            await asyncio.to_thread(_cache.store, message, reply, tier)
        except Exception:  # noqa: BLE001
            pass


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
    system = await _build_system_prompt(req.page_context, req.message, req.session_id)
    return StreamingResponse(
        _sse_chat(req.message, system, req.session_id),
        media_type="text/event-stream",
    )


class ChatRateRequest(BaseModel):
    turn_id: int
    rating: int  # -1, 0, 1
    comment: str | None = None


@router.post("/functions/chatRate")
async def chat_rate(req: ChatRateRequest, _token: str | None = Depends(optional_bearer)):
    """Owner thumbs-up/down on a chat reply. Closes the feedback loop so highly-rated
    replies become few-shot exemplars in subsequent system prompts."""
    if _chat_judge is None:
        return {"ok": False, "error": "chat_judge not loaded"}
    ok = _chat_judge.set_rating(req.turn_id, req.rating, req.comment, "owner")
    return {"ok": ok, "turn_id": req.turn_id, "rating": req.rating}


@router.get("/functions/chatStats")
@router.post("/functions/chatStats")
async def chat_stats(_token: str | None = Depends(optional_bearer)):
    """Chat-judge counts for dashboard pill."""
    if _chat_judge is None:
        return {"error": "chat_judge not loaded"}
    return _chat_judge.stats()


@router.get("/functions/cacheStats")
@router.post("/functions/cacheStats")
async def cache_stats(_token: str | None = Depends(optional_bearer)):
    """Semantic cache counts."""
    if _cache is None:
        return {"error": "semantic_cache not loaded"}
    return _cache.stats()


@router.get("/functions/brainStats")
@router.post("/functions/brainStats")
async def brain_stats(_token: str | None = Depends(optional_bearer)):
    """Combined brain telemetry: cache + judge + ensemble readiness."""
    out = {"cache": None, "judge": None, "ensemble_loaded": _ensemble is not None,
           "user_memory_loaded": _user_memory is not None}
    if _cache is not None:
        try:
            out["cache"] = _cache.stats()
        except Exception as e:  # noqa: BLE001
            out["cache"] = {"error": str(e)[:200]}
    if _chat_judge is not None:
        try:
            out["judge"] = _chat_judge.stats()
        except Exception as e:  # noqa: BLE001
            out["judge"] = {"error": str(e)[:200]}
    return out


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
