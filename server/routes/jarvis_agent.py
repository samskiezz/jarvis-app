"""JARVIS AGENT route — the tool-calling conversation endpoint.

Exposes the real planner/executor loop (``services.jarvis_agent.run_agent``) so
the bot can call tools and chain them in one pass, instead of streaming plain LLM
text. This is the runtime path the audit said was missing.

  * POST /v1/jarvis/agent/chat  — {message, history?, max_steps?} ->
        {answer, trace, backend, steps, used_tools}

Public-read (optional bearer): the loop itself only EXECUTES read tools; any write
tool is turned into a governed PENDING proposal, so an anonymous turn can read and
reason but can never silently mutate data. The actor (bearer token, if present) is
threaded through so proposals/audit carry a real identity.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services import jarvis_agent
from ..services import llm_router as _llm_router

router = APIRouter(prefix="/v1/jarvis/agent", tags=["jarvis-agent"])


class AgentChatRequest(BaseModel):
    message: str
    history: Optional[list[dict[str, Any]]] = None
    max_steps: Optional[int] = None
    page_context: Optional[Any] = None


@router.post("/chat")
async def agent_chat(req: AgentChatRequest, token: str | None = Depends(optional_bearer)):
    """Run one agentic turn: plan -> call tools (governed) -> synthesise answer."""
    actor = token or "anonymous"
    timeout_s = float(os.environ.get("JARVIS_AGENT_CHAT_TIMEOUT_S", "8"))
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(
                jarvis_agent.run_agent,
                req.message,
                history=req.history,
                actor=actor,
                max_steps=min(max(req.max_steps or jarvis_agent.MAX_STEPS_DEFAULT, 1), 6),
                page_context=req.page_context,
            ),
            timeout=timeout_s,
        )
    except asyncio.TimeoutError:
        return jarvis_agent.timeout_fallback(req.message, actor=actor)


@router.get("/tools")
async def agent_tools(_token: str | None = Depends(optional_bearer)):
    """The tool catalogue the agent reasons over (UI can show what JARVIS can do)."""
    from ..services import aip_tools
    return {"tools": aip_tools.list_tools()}


@router.get("/llm/health")
async def llm_health(_token: str | None = Depends(optional_bearer)):
    """Live provider health: configured, reachable, latency."""
    return await _llm_router.health_summary_async()
