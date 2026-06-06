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

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services import jarvis_agent

router = APIRouter(prefix="/v1/jarvis/agent", tags=["jarvis-agent"])


class AgentChatRequest(BaseModel):
    message: str
    history: Optional[list[dict[str, Any]]] = None
    max_steps: Optional[int] = None


@router.post("/chat")
async def agent_chat(req: AgentChatRequest, token: str | None = Depends(optional_bearer)):
    """Run one agentic turn: plan -> call tools (governed) -> synthesise answer."""
    actor = token or "anonymous"
    return jarvis_agent.run_agent(
        req.message,
        history=req.history,
        actor=actor,
        max_steps=req.max_steps or jarvis_agent.MAX_STEPS_DEFAULT,
    )


@router.get("/tools")
async def agent_tools(_token: str | None = Depends(optional_bearer)):
    """The tool catalogue the agent reasons over (UI can show what JARVIS can do)."""
    from ..services import aip_tools
    return {"tools": aip_tools.list_tools()}
