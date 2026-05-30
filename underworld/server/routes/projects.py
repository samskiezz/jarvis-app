"""Research project routes — list + detail + contributions."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..db.models import (
    Minion,
    ProjectContribution,
    ProjectStage,
    ResearchProject,
    World,
)
from ..db.session import get_session

router = APIRouter(prefix="/projects", tags=["projects"])


def _serialize(p: ResearchProject) -> dict:
    return {
        "id": p.id,
        "world_id": p.world_id,
        "invention_id": p.invention_id,
        "title": p.title,
        "summary": p.summary,
        "stage": p.stage.value,
        "needs_role": p.needs_role,
        "confidence": p.confidence,
        "flagged_clinical": p.flagged_clinical,
        "flagged_genetic": p.flagged_genetic,
        "flagged_chem_synth": p.flagged_chem_synth,
        "created_tick": p.created_tick,
        "updated_tick": p.updated_tick,
        "created_at": p.created_at.isoformat() if isinstance(p.created_at, datetime) else None,
        "updated_at": p.updated_at.isoformat() if isinstance(p.updated_at, datetime) else None,
    }


@router.get("")
async def list_all(
    world_id: str | None = Query(default=None),
    stage: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    stmt = select(ResearchProject)
    if world_id:
        stmt = stmt.where(ResearchProject.world_id == world_id)
    if stage:
        try:
            stage_enum = ProjectStage(stage)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"unknown stage {stage!r}")
        stmt = stmt.where(ResearchProject.stage == stage_enum)
    stmt = stmt.order_by(ResearchProject.updated_at.desc()).limit(limit)
    res = await session.execute(stmt)
    return [_serialize(p) for p in res.scalars().all()]


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    p = await session.get(ResearchProject, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="project not found")
    return _serialize(p)


@router.get("/{project_id}/contributions")
async def list_contributions(
    project_id: str,
    limit: int = Query(default=200, ge=1, le=1000),
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    p = await session.get(ResearchProject, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="project not found")
    stmt = (
        select(ProjectContribution, Minion)
        .join(Minion, Minion.id == ProjectContribution.minion_id)
        .where(ProjectContribution.project_id == project_id)
        .order_by(ProjectContribution.tick.desc(), ProjectContribution.created_at.desc())
        .limit(limit)
    )
    res = await session.execute(stmt)
    return [
        {
            "id": c.id,
            "stage": c.stage.value,
            "role": c.role.value,
            "note": c.note,
            "delta_confidence": c.delta_confidence,
            "tick": c.tick,
            "contributor": {
                "id": m.id,
                "name": m.name,
                "surname": m.surname or "",
                "guild": m.guild.value,
                "swarm_role": m.swarm_role.value,
            },
        }
        for c, m in res.all()
    ]


@router.get("/summary/world/{world_id}")
async def world_summary(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    world = await session.get(World, world_id)
    if not world:
        raise HTTPException(status_code=404, detail="world not found")

    stages = await session.execute(
        select(ResearchProject.stage, func.count(ResearchProject.id))
        .where(ResearchProject.world_id == world_id)
        .group_by(ResearchProject.stage)
    )
    by_stage = {s.value if hasattr(s, "value") else str(s): c for s, c in stages.all()}

    flagged = await session.execute(
        select(
            func.count().filter(ResearchProject.flagged_clinical.is_(True)),
            func.count().filter(ResearchProject.flagged_genetic.is_(True)),
            func.count().filter(ResearchProject.flagged_chem_synth.is_(True)),
        ).where(ResearchProject.world_id == world_id)
    )
    fc, fg, fcs = flagged.first() or (0, 0, 0)
    return {
        "world_id": world_id,
        "by_stage": by_stage,
        "flagged_clinical": int(fc),
        "flagged_genetic": int(fg),
        "flagged_chem_synth": int(fcs),
    }
