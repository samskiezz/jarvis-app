"""Knowledge base routes — concepts, formulas, roles, guardrails."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..db.models import (
    KnowledgeConcept,
    KnowledgeFormula,
    KnowledgeGuardrail,
    KnowledgeSwarmRole,
)
from ..db.session import get_session

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("/summary")
async def summary(
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    counts = {}
    for model, key in (
        (KnowledgeConcept, "concepts"),
        (KnowledgeFormula, "formulas"),
        (KnowledgeSwarmRole, "swarm_roles"),
        (KnowledgeGuardrail, "guardrails"),
    ):
        counts[key] = int(await session.scalar(select(func.count(model.id))) or 0)

    by_discipline = await session.execute(
        select(KnowledgeFormula.discipline, func.count(KnowledgeFormula.id))
        .group_by(KnowledgeFormula.discipline)
    )
    counts["formulas_by_discipline"] = {d: c for d, c in by_discipline.all()}

    by_catalogue = await session.execute(
        select(KnowledgeFormula.catalogue, func.count(KnowledgeFormula.id))
        .group_by(KnowledgeFormula.catalogue)
        .order_by(KnowledgeFormula.catalogue)
    )
    counts["catalogues"] = [{"name": n, "count": c} for n, c in by_catalogue.all()]
    return counts


@router.get("/concepts")
async def list_concepts(
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    res = await session.execute(select(KnowledgeConcept).order_by(KnowledgeConcept.section, KnowledgeConcept.title))
    return [
        {
            "id": c.id,
            "section": c.section,
            "title": c.title,
            "body": c.body,
            "tags": c.tags or [],
        }
        for c in res.scalars().all()
    ]


@router.get("/concepts/{concept_id}")
async def get_concept(
    concept_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    c = await session.get(KnowledgeConcept, concept_id)
    if not c:
        raise HTTPException(status_code=404, detail="concept not found")
    return {"id": c.id, "section": c.section, "title": c.title, "body": c.body, "tags": c.tags or []}


@router.get("/formulas")
async def list_formulas(
    discipline: str | None = Query(default=None),
    catalogue: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    stmt = select(KnowledgeFormula)
    if discipline:
        stmt = stmt.where(KnowledgeFormula.discipline == discipline)
    if catalogue:
        stmt = stmt.where(KnowledgeFormula.catalogue == catalogue)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                KnowledgeFormula.expression.ilike(pattern),
                KnowledgeFormula.catalogue.ilike(pattern),
            )
        )
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = stmt.order_by(KnowledgeFormula.id).offset(offset).limit(limit)
    res = await session.execute(stmt)
    rows = [
        {
            "id": f.id,
            "discipline": f.discipline,
            "catalogue": f.catalogue,
            "expression": f.expression,
            "keywords": f.keywords or [],
        }
        for f in res.scalars().all()
    ]
    return {"total": int(total or 0), "items": rows, "offset": offset, "limit": limit}


@router.get("/swarm-roles")
async def list_swarm_roles(
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    res = await session.execute(select(KnowledgeSwarmRole).order_by(KnowledgeSwarmRole.name))
    return [
        {"id": r.id, "name": r.name, "description": r.description, "guild_hint": r.guild_hint}
        for r in res.scalars().all()
    ]


@router.get("/guardrails")
async def list_guardrails(
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    res = await session.execute(select(KnowledgeGuardrail).order_by(KnowledgeGuardrail.stage))
    return [{"id": g.id, "stage": g.stage, "detail": g.detail} for g in res.scalars().all()]
