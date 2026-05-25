"""Seed the knowledge tables from `underworld/data/knowledge_base.json`.

Called on app startup. Idempotent: if a concept/formula already exists
with the same id, it's left alone. Re-running the extractor + restarting
the server is the supported update path for v1.
"""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import (
    KnowledgeConcept,
    KnowledgeFormula,
    KnowledgeGuardrail,
    KnowledgeSwarmRole,
)
from ..db.session import session_scope
from ..logging_setup import get_logger

log = get_logger("kb")

_KB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "knowledge_base.json"


async def seed_knowledge_base(*, force: bool = False) -> dict[str, int]:
    """Load the JSON KB into DB tables. Returns row counts inserted."""
    if not _KB_PATH.exists():
        log.warning("kb.seed.no_file", path=str(_KB_PATH))
        return {"concepts": 0, "formulas": 0, "swarm_roles": 0, "guardrails": 0}

    payload = json.loads(_KB_PATH.read_text())
    inserted = {"concepts": 0, "formulas": 0, "swarm_roles": 0, "guardrails": 0}

    async with session_scope() as session:
        if force:
            await _truncate(session)

        # Concepts
        existing_ids = await _existing_ids(session, KnowledgeConcept)
        for c in payload.get("concepts", []):
            if c["id"] in existing_ids:
                continue
            session.add(KnowledgeConcept(
                id=c["id"],
                section=c["section"],
                title=c["title"],
                body=c["body"],
                tags=c.get("tags", []),
            ))
            inserted["concepts"] += 1

        # Formulas
        existing_ids = await _existing_ids(session, KnowledgeFormula)
        for f in payload.get("formulas", []):
            if f["id"] in existing_ids:
                continue
            session.add(KnowledgeFormula(
                id=f["id"],
                discipline=f["discipline"],
                catalogue=f["catalogue"],
                expression=f["expression"],
                keywords=f.get("keywords", []),
            ))
            inserted["formulas"] += 1

        # Swarm roles
        existing_ids = await _existing_ids(session, KnowledgeSwarmRole)
        for r in payload.get("swarm_roles", []):
            if r["id"] in existing_ids:
                continue
            session.add(KnowledgeSwarmRole(
                id=r["id"],
                name=r["name"],
                description=r["description"],
                guild_hint=r["guild_hint"],
            ))
            inserted["swarm_roles"] += 1

        # Guardrails
        existing_ids = await _existing_ids(session, KnowledgeGuardrail)
        for g in payload.get("guardrails", []):
            if g["id"] in existing_ids:
                continue
            session.add(KnowledgeGuardrail(
                id=g["id"],
                stage=g["stage"],
                detail=g["detail"],
            ))
            inserted["guardrails"] += 1

    log.info("kb.seed.complete", **inserted)
    return inserted


async def _existing_ids(session: AsyncSession, model) -> set[str]:
    res = await session.execute(select(model.id))
    return {r for (r,) in res.all()}


async def _truncate(session: AsyncSession) -> None:
    from sqlalchemy import delete
    await session.execute(delete(KnowledgeConcept))
    await session.execute(delete(KnowledgeFormula))
    await session.execute(delete(KnowledgeSwarmRole))
    await session.execute(delete(KnowledgeGuardrail))
