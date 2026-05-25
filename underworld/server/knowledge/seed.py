"""Seed the knowledge tables from the JSON exports.

Two reference docs feed the KB:
  - `data/knowledge_base.json` from the V2 Master Reference docx (concepts,
    bare formulas, swarm roles, guardrails).
  - `data/knowledge_physics.json` from the V4 Physics Laws & Equations PDF
    (named laws with explanation prose).

Both are loaded on startup. Idempotent — re-runs leave existing rows alone.
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

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_KB_PATH = _DATA_DIR / "knowledge_base.json"
_PHYSICS_PATH = _DATA_DIR / "knowledge_physics.json"


async def seed_knowledge_base(*, force: bool = False) -> dict[str, int]:
    """Load the JSON KB into DB tables. Returns row counts inserted."""
    inserted = {
        "concepts": 0,
        "formulas": 0,
        "swarm_roles": 0,
        "guardrails": 0,
        "physics_entries": 0,
    }

    async with session_scope() as session:
        if force:
            await _truncate(session)

        if _KB_PATH.exists():
            payload = json.loads(_KB_PATH.read_text())

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

            # Formulas (V2 bare expressions)
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
                    source="master_reference_v2",
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
        else:
            log.warning("kb.seed.no_file", path=str(_KB_PATH))

        # Physics V4 — richer (name + equation + description) entries.
        if _PHYSICS_PATH.exists():
            phys = json.loads(_PHYSICS_PATH.read_text())
            existing_ids = await _existing_ids(session, KnowledgeFormula)
            for e in phys.get("entries", []):
                if e["id"] in existing_ids:
                    continue
                session.add(KnowledgeFormula(
                    id=e["id"],
                    discipline=e["discipline"],
                    catalogue=e["catalogue"],
                    expression=e["expression"],
                    keywords=e.get("keywords", []),
                    name=e.get("name"),
                    description=e.get("description"),
                    source="physics_laws_v4",
                ))
                inserted["physics_entries"] += 1
        else:
            log.warning("kb.seed.no_physics_file", path=str(_PHYSICS_PATH))

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
