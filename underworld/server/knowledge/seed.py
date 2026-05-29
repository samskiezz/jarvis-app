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
            import hashlib
            for idx, e in enumerate(phys.get("entries", [])):
                # The V2 extractor doesn't ship pre-baked ids — derive a
                # deterministic one from `section + name` so re-running the
                # seed is idempotent.
                name = (e.get("name") or "").strip()
                section = (e.get("section") or "").strip()
                if not name:
                    continue
                # Include equation + description in the hash because the V4
                # repeats some names with different equation variants across
                # appendix sections — section+name alone collides.
                # Index keeps each row unique even when the V4 PDF repeats
                # the same heading on multiple appendix pages.
                rid_key = f"{idx}|{section}|{name}|{(e.get('equation') or '')[:80]}"
                rid = "phys_v4_" + hashlib.sha1(rid_key.encode()).hexdigest()[:18]
                if rid in existing_ids:
                    continue
                expr = (e.get("equation") or e.get("expression") or "").strip()
                if not expr and not e.get("description"):
                    continue  # pure heading row with no content
                session.add(KnowledgeFormula(
                    id=rid,
                    discipline=e.get("discipline", "physics"),
                    catalogue=section or "physics_laws_v4",
                    expression=expr or "(see description)",
                    keywords=e.get("keywords", []),
                    name=name,
                    description=e.get("description") or None,
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
