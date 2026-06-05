"""JARVIS RESEARCH route — LLM-driven autonomous research + injection."""
from __future__ import annotations
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from ..auth import optional_bearer, require_bearer
from ..services import llm_research as lr

router = APIRouter(prefix="/v1/jarvis/research", tags=["jarvis-research"])

class ResearchBody(BaseModel):
    topic: str
    max_subtopics: int = Field(default=5, ge=1, le=12)
    inject: bool = True

@router.get("/status")
async def status(_t: str | None = Depends(optional_bearer)):
    return {"backend": lr.backend(), "available": lr.available(),
            "hint": "set OLLAMA_HOST to your Llama (e.g. http://host:11434) or KIMI_API_KEY"}

@router.post("")
async def run(body: ResearchBody, _t: str = Depends(require_bearer)):
    return lr.research(body.topic, max_subtopics=body.max_subtopics, inject=body.inject)
